// ネイティブ用スタブ。地図(Leaflet)は Web 専用なので、ネイティブでは案内のみ。
// Web では MapScreen.web.tsx が優先される（Metro のプラットフォーム解決）。
// 将来ネイティブ対応する場合は react-native-maps をここに実装する。

import { Pressable, StyleSheet, Text, View } from "react-native";

export default function MapScreen({
  stationName,
  onBack,
}: {
  stationName: string;
  onBack?: () => void;
  embedded?: boolean;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>地図は Web 版でのみ利用できます</Text>
      <Text style={styles.muted}>
        {stationName} の地図・現在地・歩行記録はブラウザ版で開いてください。
      </Text>
      {onBack && (
        <Pressable style={styles.btn} onPress={onBack}>
          <Text style={styles.btnText}>← 戻る</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  h1: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  muted: { color: "#888", fontSize: 13, textAlign: "center" },
  btn: { backgroundColor: "#1f6feb", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, marginTop: 8 },
  btnText: { color: "#fff", fontWeight: "600" },
});
