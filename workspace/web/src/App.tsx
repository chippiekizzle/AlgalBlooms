import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { MapContainer, TileLayer, ImageOverlay, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

const DEFAULT_BBOX: [number, number, number, number] = [-122.6, 37.2, -121.8, 37.9] // example bbox (SF Bay)

function FitBounds({ bbox }: { bbox: [number, number, number, number] }) {
	const map = useMap()
	const bounds = useMemo(() => L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]), [bbox])
	useEffect(() => {
		map.fitBounds(bounds)
	}, [map, bounds])
	return null
}

function formatISODate(d: Date) {
	return d.toISOString().slice(0, 10)
}

function App() {
	const [bbox, setBbox] = useState<[number, number, number, number]>(DEFAULT_BBOX)
	const [from, setFrom] = useState<string>(() => {
		const d = new Date()
		d.setDate(d.getDate() - 7)
		return formatISODate(d)
	})
	const [to, setTo] = useState<string>(() => formatISODate(new Date()))
	const [imageUrl, setImageUrl] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const bounds = useMemo(() => L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]), [bbox])
	const [assets, setAssets] = useState<string[]>([])
	const [redBand, setRedBand] = useState<string>('B04')
	const [redEdgeBand, setRedEdgeBand] = useState<string>('B05')

	async function introspect() {
		try {
			const r = await fetch('http://localhost:4000/introspect')
			if (!r.ok) throw new Error(await r.text())
			const data = await r.json()
			setAssets(data.assetNames || [])
			if (data.assetNames?.includes('B04')) setRedBand('B04')
			if (data.assetNames?.includes('B05')) setRedEdgeBand('B05')
		} catch (e) {
			console.warn('Introspect failed; using defaults')
		}
	}

	async function fetchOverlay() {
		try {
			setLoading(true)
			const resp = await fetch('http://localhost:4000/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bbox,
					width: 1024,
					height: Math.round(1024 * (bbox[3] - bbox[1]) / (bbox[2] - bbox[0])),
					timeFrom: from + 'T00:00:00Z',
					timeTo: to + 'T23:59:59Z',
					redBand,
					redEdgeBand
				})
			})
			if (!resp.ok) {
				const txt = await resp.text()
				throw new Error(txt)
			}
			const blob = await resp.blob()
			const url = URL.createObjectURL(blob)
			setImageUrl(url)
		} catch (e) {
			console.error(e)
			alert('Failed to fetch overlay. Check server logs and env token.')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		introspect()
		fetchOverlay()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
			<div style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
				<label>
					From:
					<input type="date" value={from} onChange={e => setFrom(e.target.value)} />
				</label>
				<label>
					To:
					<input type="date" value={to} onChange={e => setTo(e.target.value)} />
				</label>
				<label>
					Red band:
					<select value={redBand} onChange={e => setRedBand(e.target.value)}>
						{(assets.length ? assets : ['B04','B03','B02']).map(a => (
							<option key={a} value={a}>{a}</option>
						))}
					</select>
				</label>
				<label>
					Red-edge band:
					<select value={redEdgeBand} onChange={e => setRedEdgeBand(e.target.value)}>
						{(assets.length ? assets : ['B05','B06','B07']).map(a => (
							<option key={a} value={a}>{a}</option>
						))}
					</select>
				</label>
				<button onClick={fetchOverlay} disabled={loading}>{loading ? 'Loading…' : 'Update'}</button>
			</div>
			<MapContainer style={{ flex: 1 }} center={[0, 0]} zoom={2}>
				<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
				<FitBounds bbox={bbox} />
				{imageUrl && (
					<ImageOverlay url={imageUrl} bounds={bounds} opacity={0.8} />
				)}
			</MapContainer>
		</div>
	)
}

export default App
