import { useState } from 'react';
import manifest from '../assets/playerAssets.json';
export type TransferPlayer = { id: string; code: string; name?: string; ambiguousCode?: boolean; expectedPoints?: number; expectedPriceChange?: number; price?: number };
export function MetricNumber({ value, digits = 1, signed = false, money = false }: { value?: number; digits?: number; signed?: boolean; money?: boolean }) {
  return <bdi dir="ltr">{typeof value === 'number' && Number.isFinite(value) ? `${signed && value >= 0 ? '+' : ''}${value.toFixed(digits)}${money ? ' M' : ''}` : '—'}</bdi>;
}
export function TransferPlayerTile({ player, kind, he, metrics = false, captain = false, boost = false }: { player: TransferPlayer; kind: 'driver' | 'constructor'; he: boolean; metrics?: boolean; captain?: boolean; boost?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const asset = manifest.players.find((item) => item.kind === kind && (player.name
    ? normalize(item.name) === normalize(player.name)
    : !player.ambiguousCode && player.id === player.code && item.code === player.code));
  return <div className="transfer-player">
    <div className={`transfer-player__image transfer-player__image--${kind}`}>
      {asset && failedUrl !== asset.imageUrl ? <img src={asset.imageUrl} alt="" onError={() => setFailedUrl(asset.imageUrl)} /> : <bdi>{player.code}</bdi>}
    </div>
    <div className="transfer-player__body"><strong><bdi>{player.name || asset?.name || player.code}</bdi></strong><span className="transfer-player__code"><bdi>{player.code}</bdi></span>
      {captain && <span className="transfer-plan__badge">{he ? 'קפטן' : 'Captain'}</span>}
      {boost && <span className="transfer-plan__badge">{he ? 'אקסטרה בוסט' : 'Extra Boost'}</span>}
      {metrics && <dl className="transfer-player__metrics">
        <div><dt>{he ? 'נקודות חזויות' : 'Projected points'}</dt><dd><MetricNumber value={player.expectedPoints} /></dd></div>
        <div><dt>{he ? 'מחיר' : 'Price'}</dt><dd><MetricNumber value={player.price} digits={2} money /></dd></div>
        <div><dt>{he ? 'שינוי מחיר צפוי' : 'Expected price change'}</dt><dd><MetricNumber value={player.expectedPriceChange} digits={2} signed money /></dd></div>
      </dl>}
    </div>
  </div>;
}
