// 駅のフルループ（行き仮説 → 現地 → 帰り答え合わせ＋感想）。
// 親（App）から駅名を受け取り、Notion を直接読み書きする（ADR-0012/0013）。

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { NOTION_TOKEN } from "./config";
import { fetchStation, saveHypothesis, saveReflection, type Station } from "./notion";
import { CategoryChip, Chips, TagBlock } from "./ui";
import MapScreen from "./MapScreen";

type Phase = "loading" | "error" | "outbound" | "onsite" | "return" | "done";

export default function StationLoop({
  stationName,
  onBack,
}: {
  stationName: string;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [station, setStation] = useState<Station | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    void load();
  }, [stationName]);

  async function load() {
    setPhase("loading");
    try {
      const s = await fetchStation(stationName);
      setStation(s);
      setHypothesis(s.hypothesis);
      setReflection(s.reflection);
      setPhase(s.reflection ? "done" : "outbound");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function onSubmitHypothesis() {
    if (!station || !hypothesis.trim()) return;
    setSaving(true);
    try {
      await saveHypothesis(station.id, hypothesis.trim());
      setPhase("onsite");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitReflection() {
    if (!station || !reflection.trim()) return;
    setSaving(true);
    try {
      await saveReflection(station.id, reflection.trim());
      setPhase("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>{stationName} を読み込み中…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (phase === "error" || !station) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>うまく読めませんでした</Text>
        <Text style={styles.error}>{errMsg}</Text>
        <Text style={styles.muted}>診断: トークン長 {NOTION_TOKEN.length}（0なら未反映）</Text>
        <Pressable style={styles.btn} onPress={load}>
          <Text style={styles.btnText}>再読み込み</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={onBack}>
          <Text style={styles.linkText}>← ホームに戻る</Text>
        </Pressable>
        <StatusBar style="auto" />
      </View>
    );
  }

  const phaseLabel =
    phase === "outbound"
      ? "🚃 行きの電車：クイズ"
      : phase === "onsite"
        ? "🚶 現地：歩いて観察"
        : phase === "done"
          ? "✅ 訪問済み"
          : "🚃 帰りの電車：答え合わせ";

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.linkText}>← ホーム</Text>
        </Pressable>
        <Text style={styles.phaseTag}>{phaseLabel}</Text>
        <Text style={styles.kicker}>
          {station.ward}　{station.lines.join(" / ")}
        </Text>
        <Text style={styles.title}>{station.name}</Text>

        <Pressable style={styles.mapBtn} onPress={() => setShowMap(true)}>
          <Text style={styles.mapBtnText}>🗺 地図で見る・散歩を記録する</Text>
        </Pressable>

        {(phase === "outbound" || phase === "onsite") && (
          <>
            <CategoryChip category={station.category} />
            <Chips items={station.demands} variant="demand" />
          </>
        )}

        {phase === "outbound" && (
          <View>
            <Text style={styles.prompt}>{station.prompt}</Text>
            <Text style={styles.label}>あなたの予想（自由入力）</Text>
            <TextInput
              style={styles.input}
              value={hypothesis}
              onChangeText={setHypothesis}
              placeholder="なぜこの街はこうなった？ 思ったことを書く"
              multiline
            />
            <Pressable
              style={[styles.btn, !hypothesis.trim() && styles.btnDisabled]}
              disabled={!hypothesis.trim() || saving}
              onPress={onSubmitHypothesis}
            >
              <Text style={styles.btnText}>
                {saving ? "保存中…" : "現地へ（仮説を書くと進める）"}
              </Text>
            </Pressable>
            <Text style={styles.hint}>※ 何か書くと答え合わせが開きます（正誤は出ません）</Text>
          </View>
        )}

        {phase === "onsite" && (
          <View>
            {!!station.observePoints && (
              <>
                <Text style={styles.label}>観察ポイント</Text>
                <Text style={styles.body}>{station.observePoints}</Text>
              </>
            )}
            {!!station.route && (
              <>
                <Text style={styles.label}>おすすめルート</Text>
                <Text style={styles.body}>{station.route}</Text>
              </>
            )}
            <Pressable style={styles.btn} onPress={() => setPhase("return")}>
              <Text style={styles.btnText}>帰りの電車：答え合わせを見る</Text>
            </Pressable>
          </View>
        )}

        {(phase === "return" || phase === "done") && (
          <View>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>💡 この街の正体</Text>
              <Chips items={station.gapTypes} variant="gap" />
              <Text style={styles.calloutBody}>{station.gap}</Text>
            </View>

            <Text style={styles.label}>あなたの予想</Text>
            <Text style={styles.bodyQuote}>{hypothesis || "（未記入）"}</Text>

            <Text style={styles.label}>解説</Text>
            <TagBlock label="街の形（類型）" items={station.archetypes} variant="archetype" />
            <Text style={styles.body}>{station.answer}</Text>

            <Text style={styles.label}>供給の筋</Text>
            <TagBlock label="街の核（アンカー）" items={station.anchors} variant="anchor" />
            <TagBlock label="変えた出来事（ショック）" items={station.shocks} variant="shock" />
            <Text style={styles.body}>{station.supply}</Text>

            <Text style={styles.label}>需要の筋</Text>
            <TagBlock label="需要" items={station.demands} variant="demand" />
            <Text style={styles.body}>{station.demand}</Text>

            <Text style={styles.label}>未来の観点</Text>
            <Text style={styles.body}>{station.future}</Text>

            <Text style={styles.label}>感想</Text>
            <TextInput
              style={styles.input}
              value={reflection}
              onChangeText={setReflection}
              placeholder="歩いてみてどうだった？ 予想と比べて感じたこと"
              multiline
            />
            <Pressable
              style={[styles.btn, !reflection.trim() && styles.btnDisabled]}
              disabled={!reflection.trim() || saving}
              onPress={onSubmitReflection}
            >
              <Text style={styles.btnText}>
                {saving ? "保存中…" : "感想を保存（訪問済みにする）"}
              </Text>
            </Pressable>
            {phase === "done" && (
              <>
                <Text style={styles.hint}>この街は訪問済み。記録は Notion に保存されました。</Text>
                <Pressable style={styles.linkBtn} onPress={onBack}>
                  <Text style={styles.linkText}>← ホームに戻る</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        <StatusBar style="auto" />
      </ScrollView>

      <Modal visible={showMap} animationType="slide" onRequestClose={() => setShowMap(false)}>
        <MapScreen stationName={station.name} onBack={() => setShowMap(false)} />
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 80 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  kicker: { color: "#888", fontSize: 13 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 16 },
  phaseTag: { fontSize: 14, fontWeight: "600", color: "#3a6", marginTop: 8, marginBottom: 12 },
  prompt: { fontSize: 17, lineHeight: 26, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#555", marginTop: 16, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 24, color: "#222" },
  bodyQuote: {
    fontSize: 15,
    lineHeight: 24,
    color: "#222",
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    minHeight: 96,
    fontSize: 15,
    textAlignVertical: "top",
    marginTop: 4,
  },
  btn: {
    backgroundColor: "#1f6feb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  btnDisabled: { backgroundColor: "#aebfd6" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  mapBtn: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  mapBtnText: { color: "#047857", fontSize: 15, fontWeight: "700" },
  linkBtn: { marginTop: 18, alignItems: "center" },
  linkText: { color: "#1f6feb", fontSize: 15, fontWeight: "600" },
  callout: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  calloutTitle: { fontSize: 15, fontWeight: "800", color: "#9a3412", marginBottom: 6 },
  calloutBody: { fontSize: 16, lineHeight: 25, color: "#7c2d12", fontWeight: "600", marginTop: 8 },
  h1: { fontSize: 20, fontWeight: "700" },
  muted: { color: "#888", fontSize: 13, marginTop: 12 },
  hint: { color: "#888", fontSize: 12, marginTop: 10 },
  error: { color: "#c00", fontSize: 13, textAlign: "center" },
});
