// Walking app — エントリ。ホーム（駅選び・くじ）と駅ループ（行き→現地→帰り）を切り替える。
// 2画面なのでナビゲーションライブラリは使わず state で切り替える。

import { useState } from "react";
import HomeScreen from "./src/HomeScreen";
import StationLoop from "./src/StationLoop";

export default function App() {
  const [stationName, setStationName] = useState<string | null>(null);

  if (stationName) {
    // key を駅名にして、別駅を選ぶたびにループ状態をリセットする。
    return (
      <StationLoop
        key={stationName}
        stationName={stationName}
        onBack={() => setStationName(null)}
      />
    );
  }
  // ホームに戻るたび再マウント＝訪問状態を再取得する。
  return <HomeScreen onPick={setStationName} />;
}
