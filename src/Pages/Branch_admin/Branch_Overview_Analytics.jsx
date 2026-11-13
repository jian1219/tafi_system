import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, Receipt, Target } from 'lucide-react'
import {
  listBranchCDJEntries,
  listBranchCashReceiptsJournalEntries,
  listBranchSalesTargets
} from '../../lib/supabase'

const salesMixFields = [
  { key: 'net_cash_sales', label: 'Cash', color: '#267e69' },
  { key: 'food_panda', label: 'Foodpanda', color: '#d3a644' },
  { key: 'gcash', label: 'GCash', color: '#4d8daf' },
  { key: 'creditable_withholding_tax', label: 'Withholding tax', color: '#8972b2' }
]

const expenseMixFields = [
  { key: 'cash', label: 'Cash', color: '#267e69' },
  { key: 'bank_transfer', label: 'Bank transfer', color: '#4d8daf' },
  { key: 'gcash', label: 'GCash', color: '#d3a644' },
  { key: 'cwt', label: 'Withholding tax', color: '#8972b2' }
]

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2
})

const compactCurrencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1
})

function toCents(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

function getMonthKey(date) {
  if (typeof date !== 'string') return ''
  const monthKey = date.slice(0, 7)
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) ? monthKey : ''
}

function createMonthBuckets(salesEntries, expenseEntries, targetEntries) {
  const latestKey = [...salesEntries, ...expenseEntries, ...targetEntries]
    .map((entry) => getMonthKey(entry.date))
    .filter(Boolean)
    .sort()
    .pop()
  const [year, month] = latestKey
    ? latestKey.split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1]
  const latestDate = new Date(year, month - 1, 1)

  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(latestDate.getFullYear(), latestDate.getMonth() - 5 + index, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = date.toLocaleDateString(undefined, { month: 'short' })
    return { key, label: `${monthLabel} '${String(date.getFullYear()).slice(-2)}` }
  })
}

function getTargetMonthOptions(targets, fallbackMonth) {
  const monthKeys = new Set(
    targets.map((entry) => getMonthKey(entry.date)).filter(Boolean)
  )
  if (monthKeys.size === 0 && fallbackMonth) monthKeys.add(fallbackMonth)

  return [...monthKeys].sort().map((key) => {
    const [year, month] = key.split('-').map(Number)
    return {
      key,
      label: new Date(year, month - 1, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
      })
    }
  })
}

function getDailyTargetEntries(targets, monthKey) {
  if (!monthKey) return []

  const [year, month] = monthKey.split('-').map(Number)
  const entriesByDate = new Map(
    targets
      .filter((entry) => getMonthKey(entry.date) === monthKey)
      .map((entry) => [entry.date, entry])
  )
  const daysInMonth = new Date(year, month, 0).getDate()

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    const date = `${monthKey}-${String(day).padStart(2, '0')}`
    const entry = entriesByDate.get(date)
    return {
      date,
      day,
      target: entry?.target_sales === null || entry?.target_sales === undefined
        ? null
        : toCents(entry.target_sales),
      achieved: entry?.total_gross_sales === null || entry?.total_gross_sales === undefined
        ? null
        : toCents(entry.total_gross_sales)
    }
  })
}

function getMonthlyTotals(entries, field, months) {
  const totals = new Map(months.map(({ key }) => [key, 0]))

  entries.forEach((entry) => {
    const key = getMonthKey(entry.date)
    if (totals.has(key) && entry[field] !== null && entry[field] !== undefined) {
      totals.set(key, totals.get(key) + toCents(entry[field]))
    }
  })

  return months.map((month) => ({ ...month, value: totals.get(month.key) }))
}

function getMixTotals(entries, fields, months) {
  const monthKeys = new Set(months.map(({ key }) => key))
  return fields.map((field) => ({
    ...field,
    value: entries.reduce((total, entry) => (
      monthKeys.has(getMonthKey(entry.date))
        ? total + Math.max(0, toCents(entry[field.key]))
        : total
    ), 0)
  }))
}

function sumValues(items) {
  return items.reduce((total, item) => total + item.value, 0)
}

function countEntriesInMonths(entries, months) {
  const monthKeys = new Set(months.map(({ key }) => key))
  return entries.filter((entry) => monthKeys.has(getMonthKey(entry.date))).length
}

function formatCurrency(cents) {
  return currencyFormatter.format(cents / 100)
}

function getChartMessage({ error, isLoading, hasData }) {
  if (error) return 'Unavailable'
  if (isLoading) return 'Loading'
  return hasData ? '' : 'No data'
}

function DonutChart({ items, error, isLoading, label, emptyMessage }) {
  const total = sumValues(items)
  const hasData = total > 0
  const radius = 47
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const message = getChartMessage({ error, isLoading, hasData })

  return (
    <div className="branch-analytics-donut-layout">
      <svg className="branch-analytics-donut" viewBox="0 0 140 140" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e9efec" strokeWidth="19" />
        {hasData && items.filter((item) => item.value > 0).map((item) => {
          const length = (item.value / total) * circumference
          const segment = (
            <circle
              key={item.key}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="19"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            />
          )
          offset += length
          return segment
        })}
        <text x="70" y="66" textAnchor="middle" className="branch-analytics-donut-caption">
          {hasData ? 'TOTAL' : message}
        </text>
        {hasData && (
          <text x="70" y="83" textAnchor="middle" className="branch-analytics-donut-total">
            {compactCurrencyFormatter.format(total / 100)}
          </text>
        )}
      </svg>
      {hasData ? (
        <ul className="branch-analytics-legend">
          {items.map((item) => (
            <li key={item.key}>
              <span className="branch-analytics-legend-label">
                <span className="branch-analytics-legend-dot" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              <strong>{formatCurrency(item.value)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="branch-analytics-chart-empty">
          {error ? 'Data unavailable' : isLoading ? 'Loading records…' : emptyMessage}
        </p>
      )}
    </div>
  )
}

function BarChart({ items, error, isLoading, label }) {
  const maximum = Math.max(...items.map((item) => item.value), 0)
  const hasData = maximum > 0
  const chartTop = 18
  const chartBottom = 174
  const chartHeight = chartBottom - chartTop
  const slotWidth = 544 / items.length
  const barWidth = 36
  const message = getChartMessage({ error, isLoading, hasData })

  return (
    <svg
      className="branch-analytics-bar-chart"
      viewBox="0 0 600 214"
      role="img"
      aria-label={label}
    >
      {[chartTop, chartTop + chartHeight / 3, chartTop + (chartHeight * 2) / 3, chartBottom].map((y) => (
        <line key={y} x1="30" x2="574" y1={y} y2={y} className="branch-analytics-grid-line" />
      ))}
      {items.map((item, index) => {
        const height = hasData ? Math.max(0, (item.value / maximum) * chartHeight) : 0
        const x = 30 + index * slotWidth + (slotWidth - barWidth) / 2
        return (
          <g key={item.key}>
            {height > 0 && (
              <rect
                x={x}
                y={chartBottom - height}
                width={barWidth}
                height={height}
                rx="6"
                className="branch-analytics-bar"
              />
            )}
            <text x={x + barWidth / 2} y="199" textAnchor="middle" className="branch-analytics-axis-label">
              {item.label}
            </text>
          </g>
        )
      })}
      {!hasData && (
        <text x="302" y="102" textAnchor="middle" className="branch-analytics-empty-label">
          {message}
        </text>
      )}
    </svg>
  )
}

function DailyTargetChart({ items, monthLabel, error, isLoading }) {
  const maximum = error || isLoading
    ? 0
    : Math.max(...items.flatMap((item) => [item.target ?? 0, item.achieved ?? 0]), 0)
  const hasTargets = !error && !isLoading && items.some((item) => item.target !== null)
  const chartLeft = 54
  const chartRight = 748
  const chartTop = 22
  const chartBottom = 178
  const chartHeight = chartBottom - chartTop
  const slotWidth = (chartRight - chartLeft) / Math.max(items.length, 1)
  const barWidth = Math.min(7, slotWidth * 0.32)
  const barGap = Math.min(2, slotWidth * 0.08)
  const groupWidth = barWidth * 2 + barGap
  const message = error
    ? 'Data unavailable'
    : isLoading
      ? 'Loading daily targets…'
      : 'No daily targets recorded this month.'

  return (
    <div className="branch-analytics-daily-chart-scroll">
      <svg
        className="branch-analytics-daily-chart"
        viewBox="0 0 760 220"
        role="img"
        aria-label={`${monthLabel} daily sales targets and gross sales`}
      >
        {[1, 0.5, 0].map((fraction) => {
          const y = chartBottom - fraction * chartHeight
          return (
            <g key={fraction}>
              <line
                x1={chartLeft}
                x2={chartRight}
                y1={y}
                y2={y}
                className="branch-analytics-grid-line"
              />
              <text
                x={chartLeft - 7}
                y={y + 3}
                textAnchor="end"
                className="branch-analytics-daily-axis-label"
              >
                {compactCurrencyFormatter.format((maximum * fraction) / 100)}
              </text>
            </g>
          )
        })}
        {items.map((item, index) => {
          const targetHeight = maximum > 0 && item.target !== null
            ? (item.target / maximum) * chartHeight
            : 0
          const achievedHeight = maximum > 0 && item.achieved !== null
            ? (item.achieved / maximum) * chartHeight
            : 0
          const groupX = chartLeft + index * slotWidth + (slotWidth - groupWidth) / 2
          const dateLabel = new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
          })
          const targetLabel = item.target === null ? 'not set' : formatCurrency(item.target)
          const achievedLabel = item.achieved !== null
            ? formatCurrency(item.achieved)
            : item.target === null ? 'not tracked without a target' : 'not recorded yet'

          return (
            <g key={item.date}>
              <title>{`${dateLabel}: target ${targetLabel}, gross sales ${achievedLabel}`}</title>
              {targetHeight > 0 && (
                <rect
                  x={groupX}
                  y={chartBottom - targetHeight}
                  width={barWidth}
                  height={targetHeight}
                  rx="2"
                  className="branch-analytics-daily-target-bar"
                />
              )}
              {achievedHeight > 0 && (
                <rect
                  x={groupX + barWidth + barGap}
                  y={chartBottom - achievedHeight}
                  width={barWidth}
                  height={achievedHeight}
                  rx="2"
                  className="branch-analytics-daily-achieved-bar"
                />
              )}
              <text
                x={chartLeft + index * slotWidth + slotWidth / 2}
                y="198"
                textAnchor="middle"
                className="branch-analytics-daily-axis-label"
              >
                {item.day}
              </text>
            </g>
          )
        })}
        {!hasTargets && (
          <text
            x={(chartLeft + chartRight) / 2}
            y={(chartTop + chartBottom) / 2}
            textAnchor="middle"
            className="branch-analytics-empty-label"
          >
            {message}
          </text>
        )}
      </svg>
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <article className="branch-analytics-chart-card">
      <header>
        <h4>{title}</h4>
        <span>{subtitle}</span>
      </header>
      {children}
    </article>
  )
}

function AnalyticsGroup({
  title,
  subtitle,
  icon: Icon,
  totalLabel,
  total,
  recordCount,
  mixItems,
  monthlyItems,
  error,
  isLoading,
  periodLabel,
  kind
}) {
  return (
    <section className={`branch-analytics-group branch-analytics-group-${kind}`}>
      <header className="branch-analytics-group-header">
        <span className="branch-analytics-group-icon">
          <Icon size={19} aria-hidden="true" />
        </span>
        <div>
          <p>{subtitle}</p>
          <h3>{title}</h3>
        </div>
        <div className="branch-analytics-group-total">
          <span>{totalLabel}</span>
          <strong>{error ? 'Unavailable' : isLoading ? 'Loading…' : formatCurrency(total)}</strong>
        </div>
      </header>
      {error && <p className="branch-analytics-error" role="alert">{error}</p>}
      <div className="branch-analytics-charts">
        <ChartCard title={`${title} mix`} subtitle="By payment method">
          <DonutChart
            items={mixItems}
            error={error}
            isLoading={isLoading}
            label={`${title} payment method mix`}
            emptyMessage={`No ${title.toLowerCase()} data recorded yet.`}
          />
        </ChartCard>
        <ChartCard title={`${title} trend`} subtitle={periodLabel}>
          <BarChart
            items={monthlyItems}
            error={error}
            isLoading={isLoading}
            label={`${title} totals by month`}
          />
        </ChartCard>
      </div>
      <p className="branch-analytics-record-count">
        {error
          ? 'Entry count unavailable'
          : isLoading
            ? 'Loading journal entries…'
            : `${recordCount} journal ${recordCount === 1 ? 'entry' : 'entries'}`}
      </p>
    </section>
  )
}

function TargetAchievement({
  targetError,
  isLoading,
  targetTotal,
  achievedTotal,
  achievementRate,
  targetCount,
  achievedCount,
  targets,
  fallbackMonth
}) {
  const [selectedMonth, setSelectedMonth] = useState('')
  const monthOptions = useMemo(
    () => getTargetMonthOptions(targets, fallbackMonth),
    [targets, fallbackMonth]
  )
  const selectedMonthKey = monthOptions.some((month) => month.key === selectedMonth)
    ? selectedMonth
    : monthOptions[monthOptions.length - 1]?.key ?? ''
  const selectedMonthLabel = monthOptions.find((month) => month.key === selectedMonthKey)?.label ?? ''
  const dailyItems = useMemo(
    () => getDailyTargetEntries(targets, selectedMonthKey),
    [targets, selectedMonthKey]
  )
  const dailyTargetCount = dailyItems.filter((item) => item.target !== null).length
  const dailySalesCount = dailyItems.filter((item) => item.achieved !== null).length
  const progress = Math.min(Math.max(achievementRate ?? 0, 0), 100)
  const status = targetError
    ? 'Unavailable'
    : isLoading
      ? 'Loading'
      : targetTotal === 0
        ? 'No target set'
        : achievementRate === null
          ? 'Awaiting sales'
          : achievementRate >= 100
            ? achievementRate > 100 ? 'Target exceeded' : 'Target achieved'
            : 'In progress'

  return (
    <section className="branch-analytics-target-card" aria-labelledby="branch-analytics-target-heading">
      <header className="branch-analytics-target-header">
        <span className="branch-analytics-target-icon">
          <Target size={20} aria-hidden="true" />
        </span>
        <div className="branch-analytics-target-copy">
          <p>SALES PERFORMANCE</p>
          <h3 id="branch-analytics-target-heading">Target achieved</h3>
          <span>Gross sales compared with saved daily targets</span>
        </div>
        <span className={`branch-analytics-target-status${achievementRate >= 100 ? ' achieved' : ''}`}>
          {status}
        </span>
      </header>
      <div className="branch-analytics-target-progress">
        <strong>
          {isLoading
            ? 'Loading…'
            : targetError
              ? 'Unavailable'
              : achievementRate === null
                ? '—'
                : `${achievementRate.toFixed(1)}%`}
        </strong>
        <div
          className="branch-analytics-target-track"
          role="progressbar"
          aria-label="Sales target achievement"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={achievementRate === null ? status : `${achievementRate.toFixed(1)}% achieved`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="branch-analytics-target-metrics">
        <div>
          <span>Gross sales</span>
          <strong>{isLoading || targetError || !targetCount || !achievedCount ? '—' : formatCurrency(achievedTotal)}</strong>
        </div>
        <div>
          <span>Sales target</span>
          <strong>{isLoading || targetError || !targetCount ? '—' : formatCurrency(targetTotal)}</strong>
        </div>
        <div>
          <span>{achievementRate !== null && achievementRate >= 100 ? 'Above target' : 'Remaining'}</span>
          <strong>
            {isLoading || targetError || !targetCount
              ? '—'
              : formatCurrency(Math.abs(targetTotal - achievedTotal))}
          </strong>
        </div>
      </div>
      <p className={targetError ? 'branch-analytics-target-note error' : 'branch-analytics-target-note'} role={targetError ? 'alert' : undefined}>
        {targetError
          ? targetError
          : isLoading
            ? 'Loading sales target records…'
            : targetCount === 0
              ? 'No sales targets are recorded for this period.'
              : `${achievedCount} of ${targetCount} target days have recorded gross sales.`}
      </p>
      <div className="branch-analytics-target-daily">
        <header className="branch-analytics-target-daily-header">
          <div>
            <h4>Daily target vs. gross sales</h4>
            <p>Compare each day’s saved target with recorded gross sales. Days without a target are left blank.</p>
          </div>
          <label>
            Month
            <select
              value={selectedMonthKey}
              onChange={(event) => setSelectedMonth(event.target.value)}
              aria-label="Sales target month"
            >
              {monthOptions.map((month) => (
                <option key={month.key} value={month.key}>{month.label}</option>
              ))}
            </select>
          </label>
        </header>
        <ul className="branch-analytics-daily-legend" aria-label="Daily chart legend">
          <li><span className="branch-analytics-daily-legend-target" />Daily target</li>
          <li><span className="branch-analytics-daily-legend-achieved" />Gross sales</li>
        </ul>
        <DailyTargetChart
          items={dailyItems}
          monthLabel={selectedMonthLabel}
          error={targetError}
          isLoading={isLoading}
        />
        <p className="branch-analytics-target-daily-note">
          {targetError
            ? 'Daily target data is unavailable.'
            : isLoading
              ? 'Loading daily target records…'
              : `${dailyTargetCount} target days · ${dailySalesCount} with recorded gross sales`}
        </p>
      </div>
    </section>
  )
}

export default function BranchOverviewAnalytics({
  sessionToken
}) {
  const [analytics, setAnalytics] = useState({
    sales: [],
    expenses: [],
    targets: [],
    salesError: '',
    expenseError: '',
    targetError: '',
    isLoading: true
  })

  useEffect(() => {
    let isCurrent = true

    const loadAnalytics = async () => {
      if (!sessionToken) {
        setAnalytics({
          sales: [],
          expenses: [],
          targets: [],
          salesError: 'Branch Admin session is unavailable. Please sign in again.',
          expenseError: 'Branch Admin session is unavailable. Please sign in again.',
          targetError: 'Branch Admin session is unavailable. Please sign in again.',
          isLoading: false
        })
        return
      }

      setAnalytics((current) => ({
        ...current,
        isLoading: true,
        salesError: '',
        expenseError: '',
        targetError: ''
      }))
      const [salesResult, expenseResult, targetResult] = await Promise.all([
        listBranchCashReceiptsJournalEntries(sessionToken),
        listBranchCDJEntries(sessionToken),
        listBranchSalesTargets(sessionToken)
      ])
      if (!isCurrent) return

      setAnalytics({
        sales: salesResult.data ?? [],
        expenses: expenseResult.data ?? [],
        targets: targetResult.data ?? [],
        salesError: salesResult.error?.message ?? '',
        expenseError: expenseResult.error?.message ?? '',
        targetError: targetResult.error?.message ?? '',
        isLoading: false
      })
    }

    loadAnalytics()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const months = useMemo(
    () => createMonthBuckets(analytics.sales, analytics.expenses, analytics.targets),
    [analytics.sales, analytics.expenses, analytics.targets]
  )
  const configuredTargets = useMemo(
    () => analytics.targets.filter((entry) => entry.target_sales !== null && entry.target_sales !== undefined),
    [analytics.targets]
  )
  const achievedTargetEntries = useMemo(
    () => configuredTargets.filter((entry) => (
      entry.total_gross_sales !== null && entry.total_gross_sales !== undefined
    )),
    [configuredTargets]
  )
  const salesMix = useMemo(
    () => getMixTotals(analytics.sales, salesMixFields, months),
    [analytics.sales, months]
  )
  const expenseMix = useMemo(
    () => getMixTotals(analytics.expenses, expenseMixFields, months),
    [analytics.expenses, months]
  )
  const monthlySales = useMemo(
    () => getMonthlyTotals(analytics.sales, 'net_sales', months),
    [analytics.sales, months]
  )
  const monthlyExpenses = useMemo(
    () => getMonthlyTotals(analytics.expenses, 'total', months),
    [analytics.expenses, months]
  )
  const monthlyTargets = useMemo(
    () => getMonthlyTotals(configuredTargets, 'target_sales', months),
    [configuredTargets, months]
  )
  const monthlyTargetAchievement = useMemo(
    () => getMonthlyTotals(achievedTargetEntries, 'total_gross_sales', months),
    [achievedTargetEntries, months]
  )
  const periodLabel = `Six months through ${months[months.length - 1]?.label ?? ''}`
  const salesTotal = sumValues(monthlySales)
  const expenseTotal = sumValues(monthlyExpenses)
  const salesRecordCount = countEntriesInMonths(analytics.sales, months)
  const expenseRecordCount = countEntriesInMonths(analytics.expenses, months)
  const targetRecordCount = countEntriesInMonths(configuredTargets, months)
  const targetSalesRecordCount = countEntriesInMonths(achievedTargetEntries, months)
  const targetTotal = sumValues(monthlyTargets)
  const targetAchievedTotal = sumValues(monthlyTargetAchievement)
  const achievementRate = targetTotal > 0 && targetSalesRecordCount > 0
    ? (targetAchievedTotal / targetTotal) * 100
    : null

  return (
    <section className="branch-overview-analytics" aria-labelledby="branch-analytics-heading">
      <header className="branch-analytics-page-header">
        <div>
          <p className="branch-overview-heading-label">BRANCH ANALYTICS</p>
          <h2 id="branch-analytics-heading">Sales &amp; Expense</h2>
          <p className="branch-analytics-page-description">
            Journal performance from the latest six months of available data.
          </p>
        </div>
        <div className="branch-overview-heading-actions">
          <span className="branch-overview-count">{periodLabel}</span>
        </div>
      </header>
      {analytics.isLoading && (
        <p className="branch-analytics-loading" role="status">Loading sales and expense journal data…</p>
      )}
      <TargetAchievement
        targetError={analytics.targetError}
        isLoading={analytics.isLoading}
        targetTotal={targetTotal}
        achievedTotal={targetAchievedTotal}
        achievementRate={achievementRate}
        targetCount={targetRecordCount}
        achievedCount={targetSalesRecordCount}
        targets={analytics.targets}
        fallbackMonth={months[months.length - 1]?.key}
      />
      <div className="branch-analytics-groups">
        <AnalyticsGroup
          title="Sales"
          subtitle="Cash Receipts Journal"
          icon={Receipt}
          totalLabel="Net sales"
          total={salesTotal}
          recordCount={salesRecordCount}
          mixItems={salesMix}
          monthlyItems={monthlySales}
          error={analytics.salesError}
          isLoading={analytics.isLoading}
          periodLabel={periodLabel}
          kind="sales"
        />
        <AnalyticsGroup
          title="Expense"
          subtitle="Cash Disbursement Journal"
          icon={CircleDollarSign}
          totalLabel="Journal expenses"
          total={expenseTotal}
          recordCount={expenseRecordCount}
          mixItems={expenseMix}
          monthlyItems={monthlyExpenses}
          error={analytics.expenseError}
          isLoading={analytics.isLoading}
          periodLabel={periodLabel}
          kind="expense"
        />
      </div>
    </section>
  )
}
