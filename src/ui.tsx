// 共通UI（タグのチップ表示）。
// 色分けは「カテゴリ」だけ（カテゴリ＝固有色／その他のタグ＝中立グレーで統一）。
import { StyleSheet, Text, View } from "react-native";

// その他タグ（アンカー/ショック/需要/類型/ズレ類型）は色分けせず中立。
// variant は呼び出し側の互換のため受け取るが、配色には使わない。
export function Chips({ items, variant }: { items: string[]; variant?: string }) {
  void variant;
  const list = items.filter(Boolean);
  if (list.length === 0) return null;
  return (
    <View style={s.chipRow}>
      {list.map((t) => (
        <View key={t} style={s.chip}>
          <Text style={s.chipText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function TagBlock({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant?: string;
}) {
  if (items.filter(Boolean).length === 0) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.tagLabel}>{label}</Text>
      <Chips items={items} variant={variant} />
    </View>
  );
}

// カテゴリ（8種）ごとの固有色（Notion のカテゴリ色に対応）。全ページ共通。
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  食市場: { bg: "#ffedd5", text: "#9a3412" }, // オレンジ
  金融商業: { bg: "#fef9c3", text: "#854d0e" }, // 黄
  IT: { bg: "#dbeafe", text: "#1e40af" }, // 青
  観光文化: { bg: "#f3e8ff", text: "#6b21a8" }, // 紫
  物流: { bg: "#dcfce7", text: "#166534" }, // 緑
  住宅: { bg: "#fce7f3", text: "#9d174d" }, // ピンク
  下町: { bg: "#f5e9e2", text: "#78350f" }, // 茶
  官公庁: { bg: "#fee2e2", text: "#991b1b" }, // 赤
};

export function categoryStyle(category?: string | null): { bg: string; text: string } {
  return (category && CATEGORY_COLORS[category]) || { bg: "#e5e7eb", text: "#374151" };
}

// カテゴリのチップ（カテゴリ色で着色）。
export function CategoryChip({ category }: { category?: string | null }) {
  if (!category) return null;
  const c = categoryStyle(category);
  return (
    <View style={s.chipRow}>
      <View style={[s.chip, { backgroundColor: c.bg }]}>
        <Text style={[s.chipText, { color: c.text }]}>{category}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { backgroundColor: "#eef2f7", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  chipText: { fontSize: 12, fontWeight: "600", color: "#374151" },
  tagLabel: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
});
