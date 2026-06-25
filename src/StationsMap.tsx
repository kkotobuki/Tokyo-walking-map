// ネイティブ用スタブ。地図ピッカー(Leaflet)は Web 専用。
// Web では StationsMap.web.tsx が優先される（Metro のプラットフォーム解決）。

import { Pressable, StyleSheet, Text, View } from "react-native";

export type PickStation = { name: string; status: string | null };

export default function StationsMap({
  onClose,
}: {
  stations: PickStation[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>地図から選ぶのは Web 版でのみ利用できます</Text>
      <Pressable style={styles.btn} onPress={onClose}>
        <Text style={styles.btnText}>← 一覧へ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  h1: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  btn: { backgroundColor: "#1f6feb", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  btnText: { color: "#fff", fontWeight: "600" },
});
