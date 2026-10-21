import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, FileWarning, Medal, Trophy, UserRound } from 'lucide-react'
import { getTafiAdminEmployeePhoto, listTafiAdminEmployeeRankings } from '../../lib/supabase'

const rankingCategories = [
	{
		id: 'late_count',
		title: 'Most Late',
		description: 'Attendance marked Present (Late)',
		emptyMessage: 'No late attendance records for this period.',
		icon: Clock3,
		unit: (count) => count === 1 ? 'late' : 'lates'
	},
	{
		id: 'absent_count',
		title: 'Most Absent',
		description: 'Attendance marked Absent',
		emptyMessage: 'No absences for this period.',
		icon: UserRound,
		unit: (count) => count === 1 ? 'absence' : 'absences'
	},
	{
		id: 'incident_report_count',
		title: 'Most Incident Reports',
		description: 'Incident Reports recorded',
		emptyMessage: 'No Incident Reports for this period.',
		icon: FileWarning,
		unit: (count) => count === 1 ? 'report' : 'reports'
	}
]

const currentDate = new Date()
const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
const availableYears = Array.from(
	{ length: currentDate.getFullYear() - 1999 },
	(_, index) => String(currentDate.getFullYear() - index)
)

function getDateRange(periodMode, selectedMonth, selectedYear) {
	if (periodMode === 'yearly') {
		return {
			startDate: `${selectedYear}-01-01`,
			endDate: `${selectedYear}-12-31`
		}
	}

	const [year, month] = selectedMonth.split('-').map(Number)
	const lastDay = new Date(year, month, 0).getDate()
	return {
		startDate: `${selectedMonth}-01`,
		endDate: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`
	}
}

function getTopFive(records, metric) {
	return records
		.filter((employee) => Number(employee[metric]) > 0)
		.sort((first, second) => (
			Number(second[metric]) - Number(first[metric])
			|| first.employee_name.localeCompare(second.employee_name)
		))
		.slice(0, 5)
}

function getPeriodLabel(periodMode, selectedMonth, selectedYear) {
	if (periodMode === 'yearly') return selectedYear
	const date = new Date(`${selectedMonth}-01T12:00:00`)
	return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

function EmployeeAvatar({ employee, photoUrl, className = '' }) {
	return photoUrl ? (
		<img
			className={`ranking-employee-avatar ${className}`}
			src={photoUrl}
			alt={`${employee.employee_name} profile`}
		/>
	) : (
		<span className={`ranking-employee-avatar ranking-employee-avatar-fallback ${className}`} aria-label={employee.employee_name}>
			{employee.employee_name?.trim().charAt(0).toUpperCase() || '?'}
		</span>
	)
}

function RankingCategory({ category, employees, photos }) {
	const Icon = category.icon
	const podiumEntries = employees.slice(0, 3)
	const remainingEntries = employees.slice(3)

	return (
		<section className="ranking-category-card" aria-labelledby={`ranking-${category.id}-title`}>
			<header className="ranking-category-heading">
				<span className="ranking-category-icon"><Icon size={20} aria-hidden="true" /></span>
				<div>
					<h2 id={`ranking-${category.id}-title`}>{category.title}</h2>
					<p>{category.description}</p>
				</div>
			</header>

			{employees.length ? (
				<>
					<ol className="ranking-podium" aria-label={`${category.title} top three`}>
						{podiumEntries.map((employee, index) => {
							const rank = index + 1
							const count = Number(employee[category.id])
							return (
								<li className={`ranking-podium-entry ranking-place-${rank}`} key={employee.employee_id}>
									<div className="ranking-medal">
										<Medal size={15} aria-hidden="true" />
										<span>#{rank}</span>
									</div>
									<EmployeeAvatar
										employee={employee}
										photoUrl={photos[employee.employee_id]}
										className="ranking-podium-avatar"
									/>
									<strong className="ranking-employee-name">{employee.employee_name}</strong>
									<span className="ranking-employee-branch">{employee.branch_name}</span>
									<span className="ranking-score">
									<strong>{count}</strong>
										<span>{category.unit(count)}</span>
									</span>
									<span className="ranking-podium-base" aria-hidden="true">{rank}</span>
								</li>
							)
						})}
					</ol>

					{remainingEntries.length > 0 && (
						<ol className="ranking-next-places" start="4" aria-label={`${category.title} fourth and fifth place`}>
							{remainingEntries.map((employee, index) => {
								const rank = index + 4
								const count = Number(employee[category.id])
								return (
									<li className="ranking-next-place" key={employee.employee_id}>
										<span className="ranking-next-rank">{rank}</span>
										<EmployeeAvatar
											employee={employee}
											photoUrl={photos[employee.employee_id]}
											className="ranking-list-avatar"
										/>
										<div className="ranking-next-employee">
											<strong>{employee.employee_name}</strong>
											<span>{employee.branch_name}</span>
										</div>
										<span className="ranking-next-score">
											<strong>{count}</strong>
											<span>{category.unit(count)}</span>
										</span>
									</li>
								)
							})}
						</ol>
					)}
				</>
			) : (
				<div className="ranking-empty">
					<Trophy size={22} aria-hidden="true" />
					<p>{category.emptyMessage}</p>
				</div>
			)}
		</section>
	)
}

export default function TafiRankings({ sessionToken }) {
	const [periodMode, setPeriodMode] = useState('monthly')
	const [selectedMonth, setSelectedMonth] = useState(currentMonth)
	const [selectedYear, setSelectedYear] = useState(String(currentDate.getFullYear()))
	const [employeeMetrics, setEmployeeMetrics] = useState([])
	const [photos, setPhotos] = useState({})
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [loadError, setLoadError] = useState('')
	const [photoError, setPhotoError] = useState('')

	const dateRange = useMemo(
		() => getDateRange(periodMode, selectedMonth, selectedYear),
		[periodMode, selectedMonth, selectedYear]
	)
	const rankings = useMemo(
		() => Object.fromEntries(rankingCategories.map((category) => [
			category.id,
			getTopFive(employeeMetrics, category.id)
		])),
		[employeeMetrics]
	)
	const rankedEmployees = useMemo(
		() => [...new Map(
			rankingCategories.flatMap((category) => rankings[category.id])
				.map((employee) => [employee.employee_id, employee])
		).values()],
		[rankings]
	)
	const periodLabel = getPeriodLabel(periodMode, selectedMonth, selectedYear)

	useEffect(() => {
		let isCurrent = true

		const loadRankings = async () => {
			setIsLoading(true)
			setLoadError('')
			setEmployeeMetrics([])
			const { data, error } = await listTafiAdminEmployeeRankings(
				sessionToken,
				dateRange.startDate,
				dateRange.endDate
			)
			if (!isCurrent) return

			if (error) {
				setEmployeeMetrics([])
				setLoadError(error.message)
			} else {
				setEmployeeMetrics(data ?? [])
			}
			setIsLoading(false)
		}

		loadRankings()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, dateRange])

	useEffect(() => {
		let isCurrent = true

		const loadEmployeePhotos = async () => {
			setPhotos({})
			setPhotoError('')
			if (!rankedEmployees.length) return

			const results = await Promise.all(rankedEmployees.map(async (employee) => {
				const { data, error } = await getTafiAdminEmployeePhoto(sessionToken, employee.employee_id)
				if (error) {
					return { employee, photoUrl: '', error: `${employee.employee_name}: ${error.message}` }
				}
				const photo = data?.[0]
				return {
					employee,
					photoUrl: photo ? `data:${photo.content_type};base64,${photo.photo_base64}` : '',
					error: ''
				}
			}))
			if (!isCurrent) return

			setPhotos(Object.fromEntries(
				results.map(({ employee, photoUrl }) => [employee.employee_id, photoUrl])
			))
			const photoErrors = results.filter((result) => result.error).map((result) => result.error)
			if (photoErrors.length) {
				setPhotoError(`Some employee photos could not be loaded: ${photoErrors.join('; ')}`)
			}
		}

		loadEmployeePhotos()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, rankedEmployees])

	return (
		<div className="tafi-rankings-page">
			<header className="tafi-rankings-hero">
				<div className="tafi-rankings-hero-copy">
					<span className="tafi-rankings-kicker"><Trophy size={16} aria-hidden="true" /> Employee Management</span>
					<h2>Employee Rankings</h2>
					<p>Recognize the top five employees in attendance and incident report records.</p>
				</div>
				<div className="tafi-rankings-trophy" aria-hidden="true">
					<Trophy size={42} />
				</div>
			</header>

			<section className="ranking-period-panel" aria-label="Ranking period">
				<div className="ranking-period-heading">
					<CalendarDays size={18} aria-hidden="true" />
					<div>
						<strong>Ranking period</strong>
						<span>Choose a month or view the full year.</span>
					</div>
				</div>
				<div className="ranking-period-controls">
					<div className="ranking-period-tabs" role="group" aria-label="Ranking period type">
						<button
							type="button"
							className={periodMode === 'monthly' ? 'active' : ''}
							aria-pressed={periodMode === 'monthly'}
							onClick={() => setPeriodMode('monthly')}
						>
							Monthly
						</button>
						<button
							type="button"
							className={periodMode === 'yearly' ? 'active' : ''}
							aria-pressed={periodMode === 'yearly'}
							onClick={() => setPeriodMode('yearly')}
						>
							Full year
						</button>
					</div>
					<label className="ranking-period-select">
						<span>{periodMode === 'monthly' ? 'Select month' : 'Select year'}</span>
						{periodMode === 'monthly' ? (
							<input
								type="month"
								value={selectedMonth}
								max={currentMonth}
								onChange={(event) => {
									if (event.target.value) setSelectedMonth(event.target.value)
								}}
							/>
						) : (
							<select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
								{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
							</select>
						)}
					</label>
				</div>
			</section>

			<div className="ranking-period-caption">
				<span className="ranking-caption-dot" />
				Showing rankings for <strong>{periodLabel}</strong>
			</div>

			{loadError && <p className="ranking-message error" role="alert">Could not load employee rankings: {loadError}</p>}
			{photoError && <p className="ranking-message error" role="alert">{photoError}</p>}
			{isLoading ? (
				<p className="ranking-loading" role="status">Loading employee rankings…</p>
			) : !loadError ? (
				<div className="ranking-categories">
					{rankingCategories.map((category) => (
						<RankingCategory
							key={category.id}
							category={category}
							employees={rankings[category.id]}
							photos={photos}
						/>
					))}
				</div>
			) : null}
		</div>
	)
}