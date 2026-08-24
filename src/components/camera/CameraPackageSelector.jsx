import { useMemo, useState } from 'react'
import { Camera, Search, Check } from 'lucide-react'
import { BUDGET_TIERS, CAMERA_DATABASE, TIERS } from '../../data/cameras'

export default function CameraPackageSelector({
  value,
  onChange,
  compact = false,
  title = 'Camera Package',
  subtitle = 'Choose the real camera package so analysis and on-set tools stay grounded.',
}) {
  const [selectedBudget, setSelectedBudget] = useState(value?.budget || '')
  const [activeTier, setActiveTier] = useState(value?.tier || 'all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => (
    CAMERA_DATABASE.filter((camera) => {
      const matchTier = activeTier === 'all' || camera.tier === activeTier
      const matchBudget = !selectedBudget || camera.budget === selectedBudget
      const matchSearch = !search || `${camera.brand} ${camera.model}`.toLowerCase().includes(search.toLowerCase())
      return matchTier && matchBudget && matchSearch
    })
  ), [activeTier, search, selectedBudget])

  return (
    <div className={`rounded-xl border ${compact ? 'border-slate-800 bg-slate-900/40 p-4' : 'border-cinema-500/30 bg-cinema-500/5 p-4'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Camera className="w-4 h-4 text-cinema-400" />
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">{subtitle}</p>

      <div className="mb-4">
        <div className="text-xs text-slate-500 mb-2">Budget</div>
        <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-4'} gap-2`}>
          {BUDGET_TIERS.map((budget) => (
            <button
              key={budget.id}
              onClick={() => setSelectedBudget((current) => current === budget.id ? '' : budget.id)}
              className={`p-2.5 rounded-lg border text-left transition ${
                selectedBudget === budget.id
                  ? 'border-cinema-400 bg-cinema-500/10'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
              }`}
            >
              <div className="text-xs font-medium text-white">{budget.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{budget.range}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search camera packages"
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cinema-500"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {[{ id: 'all', label: 'All' }, ...TIERS].map((tier) => (
            <button
              key={tier.id}
              onClick={() => setActiveTier(tier.id)}
              className={`px-2.5 py-2 rounded-lg text-xs whitespace-nowrap transition ${
                activeTier === tier.id ? 'bg-cinema-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>

      {value && (
        <div className="mb-3 p-3 rounded-lg border border-onset-500/30 bg-onset-500/5">
          <div className="text-xs text-onset-400 mb-1">Current Package</div>
          <div className="text-sm font-semibold text-white">{value.brand} {value.model}</div>
          <div className="text-xs text-slate-400 mt-1">{value.sensor} · {value.resolution} · {value.codec}</div>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
        {filtered.map((camera) => (
          <button
            key={camera.id}
            onClick={() => onChange(camera)}
            className={`w-full text-left p-3 rounded-lg border transition ${
              value?.id === camera.id
                ? 'border-cinema-400 bg-cinema-500/10'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {value?.id === camera.id && <Check className="w-3.5 h-3.5 text-cinema-400 flex-shrink-0" />}
                  <span className="text-sm font-medium text-white">{camera.brand} {camera.model}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">{camera.sensor} · {camera.resolution} · {camera.codec}</div>
                <div className="text-[11px] text-slate-500 mt-1">{camera.notes}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-mono text-slate-300">${camera.priceUSD.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{camera.dynamicRange}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
