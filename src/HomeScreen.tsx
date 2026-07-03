// ホーム画面：駅を「自分で選ぶ」（検索＋タグ絞り込み＋一覧）か「くじ」（未訪問からランダム抽選・演出付き）。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  SectionList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { fetchAllStations, STATUS_VISITED, type StationSummary } from "./notion";
import { categoryStyle } from "./ui";
import StationsMap from "./StationsMap";
import { normKey } from "./coords";
import { STATION_ALIASES } from "../data/stationAliases";
import { STATION_ALIASES_AUTO } from "../data/stationAliasesAuto";

const CATEGORY_ORDER = ["食市場", "金融商業", "IT", "観光文化", "物流", "住宅", "下町", "官公庁"];

// 検索結果の1件。エイリアス（未収録の近隣駅名）でヒットした場合はその駅名を持つ。
type StationHit = StationSummary & { aliasHit?: string };

// エイリアス表（手作業層＋自動生成層）を normKey で引けるように統合しておく。
// Notion 側の駅名に表記ゆれが入っても失効しないための保険（coords.ts の NORM_COORDS と同じ流儀）。
const NORM_ALIASES: Record<string, string[]> = {};
for (const table of [STATION_ALIASES, STATION_ALIASES_AUTO]) {
  for (const [primary, aliases] of Object.entries(table)) {
    (NORM_ALIASES[normKey(primary)] ??= []).push(...aliases);
  }
}

export default function HomeScreen({ onPick }: { onPick: (name: string) => void }) {
  const [stations, setStations] = useState<StationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Set<string>>(new Set());
  const [showMap, setShowMap] = useState(false);

  // くじ演出（タップで減速して止まるスロット）
  const [drawing, setDrawing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [drawName, setDrawName] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const delayRef = useRef(70);
  const poolRef = useRef<StationSummary[]>([]);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const all = await fetchAllStations();
      all.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      setStations(all);
      setErrMsg("");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // 絞り込みに出すタグ（カテゴリ / 需要 / 類型）。
  const facets = useMemo(() => {
    const cat = new Set<string>();
    const dem = new Set<string>();
    const arch = new Set<string>();
    for (const s of stations) {
      if (s.category) cat.add(s.category);
      s.demands.forEach((d) => dem.add(d));
      s.archetypes.forEach((a) => arch.add(a));
    }
    const ja = (a: string, b: string) => a.localeCompare(b, "ja");
    return {
      categories: [...cat].sort(ja),
      demands: [...dem].sort(ja),
      archetypes: [...arch].sort(ja),
    };
  }, [stations]);

  function stationHasTag(s: StationSummary, tag: string) {
    return s.category === tag || s.demands.includes(tag) || s.archetypes.includes(tag);
  }

  const filtered = useMemo(() => {
    const q = normKey(query);
    const out: StationHit[] = [];
    for (const s of stations) {
      // 駅名で当たらなければエイリアス（未収録の近隣駅名）で当てる。
      let aliasHit: string | undefined;
      const key = normKey(s.name);
      if (q && !key.includes(q)) {
        aliasHit = (NORM_ALIASES[key] ?? []).find((a) => normKey(a).includes(q));
        if (!aliasHit) continue;
      }
      if ([...active].some((t) => !stationHasTag(s, t))) continue;
      out.push(aliasHit ? { ...s, aliasHit } : s);
    }
    return out;
  }, [stations, query, active]);

  // カテゴリごとにセクション分け（CATEGORY_ORDER 順、未分類は末尾）。
  const sections = useMemo(() => {
    const groups: Record<string, StationHit[]> = {};
    for (const s of filtered) {
      const k = s.category ?? "その他";
      (groups[k] ??= []).push(s);
    }
    const rank = (k: string) => {
      const i = CATEGORY_ORDER.indexOf(k);
      return i < 0 ? 99 : i;
    };
    return Object.keys(groups)
      .sort((a, b) => rank(a) - rank(b))
      .map((k) => ({ title: k, data: groups[k] }));
  }, [filtered]);

  function toggle(tag: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function pick() {
    const pool = poolRef.current;
    return pool[Math.floor(Math.random() * pool.length)].name;
  }

  function spinTick() {
    if (poolRef.current.length === 0) return;
    setDrawName(pick());
    if (stoppingRef.current) {
      // タップ後：徐々に間隔を伸ばして減速 → 一定を超えたら確定
      delayRef.current = delayRef.current * 1.35 + 14;
      if (delayRef.current > 430) {
        const final = pick();
        setDrawName(final);
        timerRef.current = setTimeout(() => {
          pulse.stopAnimation();
          pulse.setValue(1);
          setDrawing(false);
          onPick(final);
        }, 650);
        return;
      }
    }
    timerRef.current = setTimeout(spinTick, delayRef.current);
  }

  function drawLottery() {
    const pool = stations.filter((s) => s.status !== STATUS_VISITED);
    if (pool.length === 0) {
      Alert.alert("全駅制覇！", "行ったことのない駅はもうありません。");
      return;
    }
    poolRef.current = pool;
    stoppingRef.current = false;
    delayRef.current = 70;
    setStopping(false);
    setDrawName(pool[Math.floor(Math.random() * pool.length)].name);
    setDrawing(true);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 180, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
    ).start();
    spinTick();
  }

  function stopSpin() {
    if (!drawing || stoppingRef.current) return;
    stoppingRef.current = true;
    setStopping(true);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>駅を読み込み中…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (errMsg) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>うまく読めませんでした</Text>
        <Text style={styles.error}>{errMsg}</Text>
        <Pressable style={styles.reloadBtn} onPress={load}>
          <Text style={styles.reloadText}>再読み込み</Text>
        </Pressable>
        <StatusBar style="auto" />
      </View>
    );
  }

  const visitedCount = stations.filter((s) => s.status === STATUS_VISITED).length;
  const unvisitedCount = stations.length - visitedCount;

  const header = (
    <View>
      <Text style={styles.appTitle}>東京・街を読む</Text>
      <Text style={styles.sub}>
        {stations.length}駅中 {visitedCount}駅 踏破
      </Text>

      <View style={styles.ctaRow}>
        <Pressable
          style={({ pressed }) => [styles.cta, styles.ctaLottery, pressed && styles.ctaPressed]}
          onPress={drawLottery}
        >
          <View style={[styles.ctaIcon, styles.ctaIconLottery]}>
            <Text style={styles.ctaEmoji}>🎲</Text>
          </View>
          <View>
            <Text style={[styles.ctaTitle, styles.ctaTitleOnDark]}>くじをひく</Text>
            <Text style={[styles.ctaSub, styles.ctaSubOnDark]}>未訪問 {unvisitedCount}駅から</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.cta, styles.ctaMap, pressed && styles.ctaPressed]}
          onPress={() => setShowMap(true)}
        >
          <View style={[styles.ctaIcon, styles.ctaIconMap]}>
            <Text style={styles.ctaEmoji}>🗺</Text>
          </View>
          <View>
            <Text style={styles.ctaTitle}>地図から選ぶ</Text>
            <Text style={styles.ctaSub}>ピンで街を決める</Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>自分で選ぶ</Text>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="駅名で検索"
        returnKeyType="search"
      />

      <FacetRow label="カテゴリ" tags={facets.categories} active={active} onToggle={toggle} />
      <FacetRow label="需要" tags={facets.demands} active={active} onToggle={toggle} />
      <FacetRow label="類型" tags={facets.archetypes} active={active} onToggle={toggle} />

      <Text style={styles.count}>{filtered.length}駅</Text>
    </View>
  );

  return (
    <View style={styles.flex}>
      <SectionList
        sections={sections}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => {
          const c = categoryStyle(section.title);
          return (
            <View style={[styles.sectionHeader, { backgroundColor: c.bg }]}>
              <Text style={[styles.sectionHeaderText, { color: c.text }]}>
                {section.title}（{section.data.length}）
              </Text>
            </View>
          );
        }}
        renderItem={({ item }) => {
          const visited = item.status === STATUS_VISITED;
          return (
            <Pressable style={styles.row} onPress={() => onPick(item.name)}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.aliasHit ? `${item.ward}・${item.aliasHit}はこの駅の圏内` : item.ward}
                </Text>
              </View>
              {visited ? (
                <Text style={styles.visited}>✓ 行ったことある</Text>
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.muted}>条件に合う駅がありません</Text>}
      />

      <Modal visible={showMap} animationType="slide" onRequestClose={() => setShowMap(false)}>
        <StationsMap
          stations={stations.map((s) => ({ name: s.name, status: s.status }))}
          onPick={(name) => {
            setShowMap(false);
            onPick(name);
          }}
          onClose={() => setShowMap(false)}
        />
      </Modal>

      <Modal visible={drawing} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={stopSpin}>
          <Text style={styles.overlayDice}>🎲</Text>
          <Animated.Text style={[styles.overlayName, { transform: [{ scale: pulse }] }]}>
            {drawName}
          </Animated.Text>
          <View style={styles.tapBadge}>
            <Text style={styles.tapBadgeText}>
              {stopping ? "🎯 止まるよ…" : "👆 タップして止める"}
            </Text>
          </View>
        </Pressable>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

function FacetRow({
  label,
  tags,
  active,
  onToggle,
}: {
  label: string;
  tags: string[];
  active: Set<string>;
  onToggle: (t: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.facetLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tags.map((t) => {
          const on = active.has(t);
          return (
            <Pressable
              key={t}
              style={[styles.facetChip, on && styles.facetChipOn]}
              onPress={() => onToggle(t)}
            >
              <Text style={[styles.facetChipText, on && styles.facetChipTextOn]}>{t}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  appTitle: { fontSize: 26, fontWeight: "800" },
  sub: { color: "#888", fontSize: 13, marginTop: 4 },
  ctaRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  cta: { flex: 1, borderRadius: 20, padding: 16, minHeight: 140, justifyContent: "space-between" },
  ctaPressed: { transform: [{ scale: 0.98 }] },
  ctaLottery: {
    backgroundColor: "#5b21b6",
    borderWidth: 1,
    borderColor: "#7c3aed",
    shadowColor: "#7c3aed",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  ctaMap: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#1e3a8a",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ctaIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  ctaIconLottery: { backgroundColor: "rgba(255,255,255,0.16)" },
  ctaIconMap: { backgroundColor: "#2563eb" },
  ctaEmoji: { fontSize: 26 },
  ctaTitle: { fontSize: 18, fontWeight: "800", color: "#111", marginTop: 12 },
  ctaTitleOnDark: { color: "#fff" },
  ctaSub: { fontSize: 12, color: "#6b7280", marginTop: 3 },
  ctaSubOnDark: { color: "#ddd6fe" },
  tapBadge: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  tapBadgeText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sectionLabel: { fontSize: 15, fontWeight: "700", marginTop: 26, marginBottom: 8 },
  search: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  facetLabel: { fontSize: 12, fontWeight: "700", color: "#6b7280", marginBottom: 6 },
  facetChip: {
    backgroundColor: "#eef2f7",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 6,
  },
  facetChipOn: { backgroundColor: "#1f6feb" },
  facetChipText: { fontSize: 13, color: "#374151" },
  facetChipTextOn: { color: "#fff", fontWeight: "700" },
  count: { color: "#888", fontSize: 12, marginTop: 16, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  sectionHeader: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 22,
    marginBottom: 2,
  },
  sectionHeaderText: { fontSize: 14, fontWeight: "800" },
  rowMain: { flex: 1 },
  rowName: { fontSize: 17, fontWeight: "600", color: "#111" },
  rowMeta: { fontSize: 12, color: "#888", marginTop: 2 },
  visited: { fontSize: 12, color: "#16a34a", fontWeight: "700" },
  chevron: { fontSize: 22, color: "#ccc" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17,17,17,0.92)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  overlayDice: { fontSize: 56 },
  overlayName: { color: "#fff", fontSize: 40, fontWeight: "800", textAlign: "center", paddingHorizontal: 24 },
  h1: { fontSize: 20, fontWeight: "700" },
  muted: { color: "#888", fontSize: 13, marginTop: 12, textAlign: "center" },
  error: { color: "#c00", fontSize: 13, textAlign: "center" },
  reloadBtn: { backgroundColor: "#1f6feb", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, marginTop: 8 },
  reloadText: { color: "#fff", fontWeight: "600" },
});
