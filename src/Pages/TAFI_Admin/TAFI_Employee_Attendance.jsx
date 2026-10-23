import { useEffect, useMemo, useState } from 'react'
import {
	listTafiAdminAttendance,
	listTafiAdminAttendancePeriodControls,
	listTafiAdminAttendanceSubmissionHistory,
	listTafiAdminBranches,
	listTafiAdminEmployeeLeaveCredits,
	listTafiAdminEmployees,
	listTafiAdminOvertimeHours,
	listTafiAdminUndertimeDeductions,
	listGuestEmployeeAttendance,
	listGuestEmployeeBranches,
	listGuestEmployees,
	listGuestOvertimeHours,
	listGuestUndertimeDeductions,
	saveTafiAdminAttendance,
	getTafiAdminAttendancePeriodAccessMode,
	setTafiAdminAttendancePeriodAccessMode,
	setTafiAdminAttendancePeriodLock
} from '../../lib/supabase'
import {
	getAttendanceDayValue,
	getAttendanceRemark,
	getLocalDateKey,
	hasEarnedMonthlyCredit
} from '../Branch_admin/branchAttendanceRecords'
import { getPayrollPeriods } from '../../lib/payrollPeriods'
import { recordLegend, statusCodeClassNames, statusCodes } from '../attendanceStatusDisplay'

const attendanceOptions = [
	'Not marked',
	'Present',
	'Present (Late)',
	'Half Day',
	'Absent',
	'Maternity Leave',
	'Paternity Leave',
	'Authorized Leave',
	'Birthday Leave',
	'Sick Leave',
	'Emergency Leave',
	'Leave with Pay',
	'VL without Pay',
	'Day Off'
]

const shiftOptions = [
	'9am-2pm | 6pm-9pm',
	'11am-4pm | 6pm-9pm',
	'1pm-9pm'
]

const shiftEligibleStatuses = ['Present', 'Present (Late)', 'Half Day']
const attendanceHistoryPageSize = 100

const statusFromDatabase = {
	not_marked: 'Not marked',
	present: 'Present',
	present_late: 'Present (Late)',
	half_day: 'Half Day',
	absent: 'Absent',
	maternity_leave: 'Maternity Leave',
	paternity_leave: 'Paternity Leave',
	authorized_leave: 'Authorized Leave',
	birthday_leave: 'Birthday Leave',
	sick_leave: 'Sick Leave',
	emergency_leave: 'Emergency Leave',
	vl_with_pay: 'Leave with Pay',
	vl_without_pay: 'VL without Pay',
	day_off: 'Day Off'
}

const statusToDatabase = Object.fromEntries(
	Object.entries(statusFromDatabase).map(([status, label]) => [label, status])
)

function getMonthDates(monthKey) {
	const [year, month] = monthKey.split('-').map(Number)
	const start = new Date(year, month - 1, 1)
	const end = new Date(year, month, 0)
	return {
		start: getLocalDateKey(start),
		end: getLocalDateKey(end),
		days: end.getDate(),
		year,
		monthIndex: month - 1
	}
}

function formatCurrency(amount) {
	return amount.toLocaleString('en-PH', {
		style: 'currency',
		currency: 'PHP',
		minimumFractionDigits: 2
	})
}

function formatAttendanceDate(dateKey) {
	return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	})
}

function formatSubmittedAt(timestamp) {
	return new Date(timestamp).toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	})
}

export default function TafiEmployeeAttendance({ sessionToken, readOnly = false }) {
	const [attendanceDateKey] = useState(() => getLocalDateKey(new Date()))
	const [activeTab, setActiveTab] = useState(readOnly ? 'weekly' : 'daily')
	const [branches, setBranches] = useState([])
	const [directoryEmployees, setDirectoryEmployees] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [dailyAttendanceDateKey, setDailyAttendanceDateKey] = useState(attendanceDateKey)
	const [selectedRecordsMonth, setSelectedRecordsMonth] = useState(attendanceDateKey.slice(0, 7))
	const [dailyEmployees, setDailyEmployees] = useState([])
	const [attendanceRecords, setAttendanceRecords] = useState([])
	const [overtimeRecords, setOvertimeRecords] = useState([])
	const [undertimeRecords, setUndertimeRecords] = useState([])
	const [leaveCreditBalances, setLeaveCreditBalances] = useState({})
	const [submissionHistory, setSubmissionHistory] = useState([])
	const [periodControls, setPeriodControls] = useState([])
	const [periodAccessMode, setPeriodAccessMode] = useState('weekly')
	const [historyOffset, setHistoryOffset] = useState(0)
	const [historyReloadKey, setHistoryReloadKey] = useState(0)
	const [hasMoreHistory, setHasMoreHistory] = useState(false)
	const [isLoadingDirectory, setIsLoadingDirectory] = useState(Boolean(sessionToken))
	const [isLoadingAttendance, setIsLoadingAttendance] = useState(false)
	const [isLoadingLeaveCredits, setIsLoadingLeaveCredits] = useState(false)
	const [isLoadingHistory, setIsLoadingHistory] = useState(false)
	const [isLoadingPeriodControls, setIsLoadingPeriodControls] = useState(false)
	const [isLoadingPeriodAccessMode, setIsLoadingPeriodAccessMode] = useState(false)
	const [isSavingPeriodAccessMode, setIsSavingPeriodAccessMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [selectedWeekIndex, setSelectedWeekIndex] = useState(0)
	const [loadError, setLoadError] = useState('')
	const [leaveCreditError, setLeaveCreditError] = useState('')
	const [monthlyMetricsError, setMonthlyMetricsError] = useState('')
	const [historyError, setHistoryError] = useState('')
	const [periodControlsError, setPeriodControlsError] = useState('')
	const [periodControlsMessage, setPeriodControlsMessage] = useState('')
	const [periodControlAction, setPeriodControlAction] = useState('')
	const [saveMessage, setSaveMessage] = useState('')
	const [saveError, setSaveError] = useState('')

	const monthDates = useMemo(() => getMonthDates(selectedRecordsMonth), [selectedRecordsMonth])
	const weeklyControlPeriods = useMemo(
		() => getPayrollPeriods(selectedRecordsMonth),
		[selectedRecordsMonth]
	)
	const dailyControlPeriods = useMemo(
		() => Array.from({ length: monthDates.days }, (_, index) => {
			const day = index + 1
			const startDate = `${selectedRecordsMonth}-${String(day).padStart(2, '0')}`
			return {
				label: `Daily · ${formatAttendanceDate(startDate)}`,
				startDate,
				endDate: startDate
			}
		}),
		[selectedRecordsMonth, monthDates.days]
	)
	const controlPeriods = periodAccessMode === 'daily' ? dailyControlPeriods : weeklyControlPeriods
	const controlPeriodStarts = useMemo(
		() => controlPeriods.map((period) => period.startDate),
		[controlPeriods]
	)
	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const branchEmployees = useMemo(() => directoryEmployees
		.filter((employee) =>
			employee.branch_id === selectedBranchId
			&& employee.employment_status === 'active'
		)
		.map((employee) => ({
			id: employee.employee_code,
			name: employee.employee_name,
			position: employee.employee_position,
			dailyRate: Number(employee.daily_rate),
			employmentClassification: employee.employment_classification
		})), [directoryEmployees, selectedBranchId])

	const dailyDate = new Date(`${dailyAttendanceDateKey}T12:00:00`)
	const dailyDateMonthStart = getLocalDateKey(new Date(dailyDate.getFullYear(), dailyDate.getMonth(), 1))
	const dailyDateMonthEnd = getLocalDateKey(new Date(dailyDate.getFullYear(), dailyDate.getMonth() + 1, 0))

	useEffect(() => {
		let isCurrent = true

		const loadDirectory = async () => {
			setIsLoadingDirectory(true)
			setLoadError('')
			const [branchesResult, employeesResult] = await Promise.all([
				readOnly ? listGuestEmployeeBranches(sessionToken) : listTafiAdminBranches(sessionToken),
				readOnly ? listGuestEmployees(sessionToken) : listTafiAdminEmployees(sessionToken)
			])
			if (!isCurrent) return

			if (branchesResult.error || employeesResult.error) {
				setLoadError(
					[branchesResult.error?.message, employeesResult.error?.message]
						.filter(Boolean)
						.join(' ')
				)
				setIsLoadingDirectory(false)
				return
			}

			const loadedBranches = branchesResult.data ?? []
			setBranches(loadedBranches)
			setDirectoryEmployees(employeesResult.data ?? [])
			setSelectedBranchId((currentBranchId) =>
				loadedBranches.some((branch) => branch.branch_id === currentBranchId)
					? currentBranchId
					: loadedBranches[0]?.branch_id ?? ''
			)
			setIsLoadingDirectory(false)
		}

		if (sessionToken) loadDirectory()

		return () => {
			isCurrent = false
		}
	}, [sessionToken, readOnly])

	useEffect(() => {
		if (activeTab !== 'history' || !sessionToken) return undefined

		let isCurrent = true
		const loadSubmissionHistory = async () => {
			setIsLoadingHistory(true)
			setHistoryError('')
			const { data, error } = await listTafiAdminAttendanceSubmissionHistory(
				sessionToken,
				0,
				attendanceHistoryPageSize
			)
			if (!isCurrent) return

			if (error) {
				setHistoryError(error.message)
				setSubmissionHistory([])
				setHistoryOffset(0)
				setHasMoreHistory(false)
			} else {
				const records = data ?? []
				setSubmissionHistory(records)
				setHistoryOffset(records.length)
				setHasMoreHistory(records.length === attendanceHistoryPageSize)
			}
			setIsLoadingHistory(false)
		}

		loadSubmissionHistory()
		return () => {
			isCurrent = false
		}
	}, [activeTab, sessionToken, historyReloadKey])

	useEffect(() => {
		if (activeTab !== 'access' || !sessionToken || !selectedBranchId) return undefined

		let isCurrent = true
		const loadPeriodAccessMode = async () => {
			setIsLoadingPeriodAccessMode(true)
			setPeriodControlsError('')
			setPeriodControlsMessage('')
			const { data, error } = await getTafiAdminAttendancePeriodAccessMode(
				sessionToken,
				selectedBranchId
			)
			if (!isCurrent) return

			if (error) {
				setPeriodControlsError(error.message)
			} else if (data !== 'weekly' && data !== 'daily') {
				setPeriodControlsError('The attendance access mode service returned invalid data.')
			} else {
				setPeriodAccessMode(data)
			}
			setIsLoadingPeriodAccessMode(false)
		}

		loadPeriodAccessMode()
		return () => {
			isCurrent = false
		}
	}, [activeTab, sessionToken, selectedBranchId])

	useEffect(() => {
		if (
			activeTab !== 'access'
			|| !sessionToken
			|| !selectedBranchId
			|| isLoadingPeriodAccessMode
			|| periodControlsError
		) return undefined

		let isCurrent = true
		const loadPeriodControls = async () => {
			setIsLoadingPeriodControls(true)
			setPeriodControlsMessage('')
			const { data, error } = await listTafiAdminAttendancePeriodControls(
				sessionToken,
				selectedBranchId,
				controlPeriodStarts
			)
			if (!isCurrent) return

			if (error) {
				setPeriodControls([])
				setPeriodControlsError(error.message)
			} else {
				setPeriodControls(data ?? [])
			}
			setIsLoadingPeriodControls(false)
		}

		loadPeriodControls()
		return () => {
			isCurrent = false
		}
	}, [
		activeTab,
		sessionToken,
		selectedBranchId,
		controlPeriodStarts,
		isLoadingPeriodAccessMode,
		periodControlsError
	])

	useEffect(() => {
		if (!sessionToken || !selectedBranchId) {
			return undefined
		}

		let isCurrent = true
		const attendanceRanges = new Map([[monthDates.start, monthDates.end]])
		if (!readOnly) attendanceRanges.set(dailyDateMonthStart, dailyDateMonthEnd)

		const loadAttendance = async () => {
			setIsLoadingAttendance(true)
			setIsLoadingLeaveCredits(true)
			setLoadError('')
			setLeaveCreditError('')

			const attendanceRequests = [...attendanceRanges].map(([startDate, endDate]) =>
				readOnly
					? listGuestEmployeeAttendance(sessionToken, selectedBranchId, startDate, endDate)
					: listTafiAdminAttendance(sessionToken, selectedBranchId, startDate, endDate)
			)
			const [attendanceResults, leaveCreditResult, overtimeResult, undertimeResult] = await Promise.all([
				Promise.all(attendanceRequests),
				readOnly
					? Promise.resolve({ data: [], error: null })
					: listTafiAdminEmployeeLeaveCredits(sessionToken, selectedBranchId),
				readOnly
					? listGuestOvertimeHours(sessionToken, selectedBranchId, monthDates.start, monthDates.end)
					: listTafiAdminOvertimeHours(sessionToken, selectedBranchId, monthDates.start, monthDates.end),
				readOnly
					? listGuestUndertimeDeductions(sessionToken, selectedBranchId, monthDates.start, monthDates.end)
					: listTafiAdminUndertimeDeductions(sessionToken, selectedBranchId, monthDates.start, monthDates.end)
			])
			if (!isCurrent) return

			const metricErrors = [overtimeResult.error, undertimeResult.error].filter(Boolean)
			setMonthlyMetricsError(metricErrors.map((error) => error.message).join(' '))
			setOvertimeRecords(overtimeResult.error ? null : overtimeResult.data ?? [])
			setUndertimeRecords(undertimeResult.error ? null : undertimeResult.data ?? [])
			if (leaveCreditResult.error) {
				setLeaveCreditBalances({})
				setLeaveCreditError(leaveCreditResult.error.message)
			} else {
				setLeaveCreditBalances(Object.fromEntries(
					(leaveCreditResult.data ?? []).map((record) => [
						record.employee_code,
						Math.max(0, Number(record.balance ?? 0) - Number(record.pending_credits ?? 0))
					])
				))
			}

			const attendanceError = attendanceResults.find((result) => result.error)?.error
			if (attendanceError) {
				setLoadError(attendanceError.message)
				setAttendanceRecords([])
				setDailyEmployees(branchEmployees.map((employee) => ({
					...employee,
					shift: '',
					status: 'Not marked',
					lateMinutes: 0
				})))
				setIsLoadingAttendance(false)
				setIsLoadingLeaveCredits(false)
				return
			}

			const records = [...new Map(
				attendanceResults.flatMap((result) => result.data ?? [])
					.map((record) => [`${record.employee_code}:${record.attendance_date}`, record])
			).values()]
			const attendanceForSelectedDate = Object.fromEntries(
				records
					.filter((record) => record.attendance_date === dailyAttendanceDateKey)
					.map((record) => [record.employee_code, record])
			)
			setAttendanceRecords(records)
			setDailyEmployees(branchEmployees.map((employee) => {
				const record = attendanceForSelectedDate[employee.id]
				const status = statusFromDatabase[record?.status] ?? 'Not marked'
				return {
					...employee,
					shift: shiftEligibleStatuses.includes(status) ? record?.shift ?? '' : '',
					status,
					lateMinutes: record?.late_minutes ?? 0
				}
			}))

			setIsLoadingAttendance(false)
			setIsLoadingLeaveCredits(false)
		}

		loadAttendance()
		return () => {
			isCurrent = false
		}
	}, [
		sessionToken,
		selectedBranchId,
		monthDates.start,
		monthDates.end,
		dailyAttendanceDateKey,
		dailyDateMonthStart,
		dailyDateMonthEnd,
		branchEmployees,
		readOnly
	])

	const monthRecords = useMemo(() => branchEmployees.map((employee, index) => {
		const recordsByDay = new Map(
			attendanceRecords
				.filter((record) =>
					record.employee_code === employee.id
					&& record.attendance_date.startsWith(`${selectedRecordsMonth}-`)
				)
				.map((record) => [Number(record.attendance_date.slice(-2)), record])
		)
		const days = Array.from({ length: monthDates.days }, (_, dayIndex) =>
			statusCodes[recordsByDay.get(dayIndex + 1)?.status] ?? ''
		)
		const lateMinutesByDay = Array.from({ length: monthDates.days }, (_, dayIndex) => {
			const record = recordsByDay.get(dayIndex + 1)
			return record?.status === 'present_late' ? Number(record.late_minutes) || 0 : 0
		})
		const lateMinutes = [...recordsByDay.values()].reduce(
			(total, record) => total + (record.status === 'present_late' ? Number(record.late_minutes) || 0 : 0),
			0
		)
		const overtimeHours = overtimeRecords === null ? null : overtimeRecords
			.filter((record) => record.employee_code === employee.id)
			.reduce((total, record) => total + Number(record.hours || 0), 0)
		const undertimeMinutes = undertimeRecords === null ? null : undertimeRecords
			.filter((record) => record.employee_code === employee.id)
			.reduce((total, record) => total + Number(record.undertime_minutes || 0), 0)
		const presentDays = [...recordsByDay.values()].reduce(
			(total, record) => total + getAttendanceDayValue(record.status),
			0
		)
		const fullPresentDays = [...recordsByDay.values()].filter(
			(record) => record.status === 'present' || record.status === 'present_late'
		).length
		const attendanceRate = monthDates.days
			? Math.round((presentDays / monthDates.days) * 100)
			: 0

		return {
			no: index + 1,
			id: employee.id,
			name: employee.name,
			days,
			lateMinutesByDay,
			lateMinutes,
			overtimeHours,
			undertimeMinutes,
			presentDays,
			totalDays: monthDates.days,
			attendanceRate,
			attendanceRemark: getAttendanceRemark(attendanceRate),
			earnedCredit: employee.employmentClassification === 'Regular'
				&& hasEarnedMonthlyCredit(fullPresentDays, selectedRecordsMonth)
				? 1.25
				: 0
		}
	}), [
		branchEmployees,
		attendanceRecords,
		overtimeRecords,
		undertimeRecords,
		selectedRecordsMonth,
		monthDates.days
	])

	const weeklyRecords = useMemo(() => getPayrollPeriods(selectedRecordsMonth).map(
		(period) => {
			const { startDay: firstDay, endDay: lastDay } = period
			const days = Array.from({ length: lastDay - firstDay + 1 }, (_, dayIndex) => {
				const day = firstDay + dayIndex
				return {
					day,
					date: new Date(monthDates.year, monthDates.monthIndex, day)
				}
			})
			const records = attendanceRecords.filter((record) => {
				const day = Number(record.attendance_date.slice(-2))
				return record.attendance_date.startsWith(`${selectedRecordsMonth}-`)
					&& day >= firstDay
					&& day <= lastDay
			})

			return {
				label: period.label,
				days,
				present: records.reduce(
					(total, record) => total + getAttendanceDayValue(record.status),
					0
				),
				late: records.filter((record) => record.status === 'present_late').length,
				absent: records.filter((record) => record.status === 'absent').length,
				records
			}
		}
	), [attendanceRecords, selectedRecordsMonth, monthDates.year, monthDates.monthIndex])

	const selectedWeek = weeklyRecords[selectedWeekIndex] ?? weeklyRecords[0]
	const weeklySummary = selectedWeek ? {
		present: selectedWeek.present,
		late: selectedWeek.late,
		absent: selectedWeek.absent,
		rate: branchEmployees.length
			? Math.round((selectedWeek.present / (branchEmployees.length * selectedWeek.days.length)) * 100)
			: 0
	} : { present: 0, late: 0, absent: 0, rate: 0 }
	const totalPresent = dailyEmployees.filter((employee) =>
		['Present', 'Present (Late)', 'Half Day'].includes(employee.status)
	).length
	const totalLate = dailyEmployees.filter((employee) => employee.status === 'Present (Late)').length
	const totalAbsent = dailyEmployees.filter((employee) => employee.status === 'Absent').length
	const summary = {
		present: monthRecords.reduce((sum, employee) => sum + employee.presentDays, 0),
		late: monthRecords.reduce(
			(sum, employee) => sum + employee.days.filter((day) => day === 'L').length,
			0
		),
		absent: monthRecords.reduce(
			(sum, employee) => sum + employee.days.filter((day) => day === 'A').length,
			0
		)
	}
	summary.rate = branchEmployees.length && monthDates.days
		? Math.round((summary.present / (branchEmployees.length * monthDates.days)) * 100)
		: 0

	const hasLeaveCreditForDay = (employeeId) => (leaveCreditBalances[employeeId] ?? 0) >= 1
	const getLateDeduction = (employee) => {
		if (!Number.isFinite(employee.dailyRate)
			|| !Number.isInteger(employee.lateMinutes)
			|| employee.lateMinutes < 1) return null
		return (employee.dailyRate / 8 / 60) * employee.lateMinutes
	}

	const updateStatus = (employeeId, status) => {
		setDailyEmployees((current) => current.map((employee) => employee.id === employeeId
			? {
				...employee,
				status,
				shift: shiftEligibleStatuses.includes(status) ? employee.shift : '',
				lateMinutes: status === 'Present (Late)' ? employee.lateMinutes : 0
			}
			: employee))
		setSaveMessage('')
		setSaveError('')
	}

	const updateShift = (employeeId, shift) => {
		setDailyEmployees((current) => current.map((employee) => employee.id === employeeId
			? { ...employee, shift }
			: employee))
		setSaveMessage('')
		setSaveError('')
	}

	const updateLateMinutes = (employeeId, minutes) => {
		setDailyEmployees((current) => current.map((employee) => employee.id === employeeId
			? { ...employee, lateMinutes: minutes === '' ? 0 : Math.max(0, Number(minutes)) }
			: employee))
		setSaveMessage('')
		setSaveError('')
	}

	const saveAttendance = async () => {
		const missingShift = dailyEmployees.find((employee) =>
			shiftEligibleStatuses.includes(employee.status) && !employee.shift
		)
		if (missingShift) {
			setSaveError(`Select a shift for ${missingShift.name} before saving attendance.`)
			setSaveMessage('')
			return
		}

		const incompleteLateEntry = dailyEmployees.find((employee) =>
			employee.status === 'Present (Late)'
			&& (!Number.isInteger(employee.lateMinutes) || employee.lateMinutes < 1)
		)
		if (incompleteLateEntry) {
			setSaveError(`Enter a whole number of late minutes for ${incompleteLateEntry.name} before saving.`)
			setSaveMessage('')
			return
		}

		setIsSaving(true)
		const records = dailyEmployees.map((employee) => ({
			employee_code: employee.id,
			shift: shiftEligibleStatuses.includes(employee.status) ? employee.shift || null : null,
			status: statusToDatabase[employee.status] ?? 'not_marked',
			late_minutes: employee.status === 'Present (Late)' ? employee.lateMinutes : 0
		}))
		const { error } = await saveTafiAdminAttendance(
			sessionToken,
			selectedBranchId,
			dailyAttendanceDateKey,
			records
		)
		setIsSaving(false)
		if (error) {
			setSaveError(error.message)
			setSaveMessage('')
			return
		}

		setAttendanceRecords((current) => [
			...current.filter((record) => record.attendance_date !== dailyAttendanceDateKey),
			...records.map((record) => ({ ...record, attendance_date: dailyAttendanceDateKey }))
		])
		setSaveError('')
		setSaveMessage('Shift, attendance, and late minutes saved.')
	}

	const updatePeriodLock = async (period) => {
		const control = periodControls.find((item) => item.period_start === period.startDate)
		const nextIsLocked = !control?.is_locked
		setPeriodControlAction(period.startDate)
		setPeriodControlsError('')
		setPeriodControlsMessage('')
		const { error } = await setTafiAdminAttendancePeriodLock(
			sessionToken,
			selectedBranchId,
			period.startDate,
			period.endDate,
			nextIsLocked
		)
		setPeriodControlAction('')
		if (error) {
			setPeriodControlsError(error.message)
			return
		}

		setPeriodControls((current) => current.map((item) =>
			item.period_start === period.startDate
				? {
					...item,
					is_locked: nextIsLocked,
					is_automatic: false,
					pending_request_id: null,
					requested_by: null,
					requested_at: null
				}
				: item
		))
		setPeriodControlsMessage(
			`${period.label} ${nextIsLocked ? 'locked' : 'unlocked'} for ${selectedBranch?.branch_name ?? 'the selected branch'}.`
		)
	}

	const updatePeriodAccessMode = async (accessMode) => {
		if (accessMode === periodAccessMode || isSavingPeriodAccessMode) return

		setIsSavingPeriodAccessMode(true)
		setPeriodControlsError('')
		setPeriodControlsMessage('')
		const { error } = await setTafiAdminAttendancePeriodAccessMode(
			sessionToken,
			selectedBranchId,
			accessMode
		)
		setIsSavingPeriodAccessMode(false)
		if (error) {
			setPeriodControlsError(error.message)
			return
		}

		setPeriodAccessMode(accessMode)
		setPeriodControls([])
		setPeriodControlsMessage(
			`Attendance access is now ${accessMode === 'daily' ? 'daily' : 'weekly'} for ${selectedBranch?.branch_name ?? 'the selected branch'}.`
		)
	}

	const loadOlderSubmissions = async () => {
		if (isLoadingHistory || !hasMoreHistory) return

		setIsLoadingHistory(true)
		setHistoryError('')
		const { data, error } = await listTafiAdminAttendanceSubmissionHistory(
			sessionToken,
			historyOffset,
			attendanceHistoryPageSize
		)
		if (error) {
			setHistoryError(error.message)
		} else {
			const records = data ?? []
			setSubmissionHistory((current) => [...current, ...records])
			setHistoryOffset((current) => current + records.length)
			setHasMoreHistory(records.length === attendanceHistoryPageSize)
		}
		setIsLoadingHistory(false)
	}

	const refreshSubmissionHistory = () => {
		setSubmissionHistory([])
		setHistoryOffset(0)
		setHasMoreHistory(false)
		setHistoryReloadKey((current) => current + 1)
	}

	const updateRecordsMonth = (month) => {
		if (!month) return
		setSelectedWeekIndex(0)
		setSelectedRecordsMonth(month)
		setSaveError('')
	}

	const recordsMonthSelector = (
		<label className="attendance-month-select">
			<span>Month</span>
			<input
				type="month"
				value={selectedRecordsMonth}
				max={attendanceDateKey.slice(0, 7)}
				onChange={(event) => updateRecordsMonth(event.target.value)}
			/>
		</label>
	)

	return (
		<div className="attendance-monitoring-shell">
			<div className="attendance-header-strip tafi-attendance-header">
				<div className="branch-title">{selectedBranch?.branch_name ?? (readOnly ? 'Guest' : 'TAFI Admin')}</div>
				<label className="tafi-attendance-branch-select">
					<span>Branch</span>
					<select
						value={selectedBranchId}
						disabled={isLoadingDirectory || branches.length === 0}
						onChange={(event) => {
							setSelectedBranchId(event.target.value)
							setSaveMessage('')
							setSaveError('')
						}}
					>
						{branches.length === 0 && <option value="">No branches available</option>}
						{branches.map((branch) => (
							<option key={branch.branch_id} value={branch.branch_id}>
								{branch.branch_name}
							</option>
						))}
					</select>
				</label>
			</div>

			<div className="attendance-monitoring-bar">
				<h3>Attendance Monitoring</h3>
			</div>
			{!sessionToken && (
				<p className="payroll-contribution-message error" role="alert">
					Your {readOnly ? 'Guest' : 'TAFI Admin'} login session is missing. Sign out and sign in again.
				</p>
			)}
			{loadError && <p className="payroll-contribution-message error" role="alert">{loadError}</p>}
			{isLoadingDirectory && <p className="payroll-contribution-message" role="status">Loading branches and employees…</p>}
			{leaveCreditError && (
				<p className="payroll-contribution-message error" role="alert">
					Could not verify leave credits: {leaveCreditError} Leave with Pay is unavailable until credits can be checked.
				</p>
			)}

			<div className="attendance-monitoring-tabs">
				{!readOnly && (
					<button
						type="button"
						className={activeTab === 'daily' ? 'monitoring-tab active' : 'monitoring-tab'}
						onClick={() => setActiveTab('daily')}
					>
						Daily Attendance
					</button>
				)}
				<button
					type="button"
					className={activeTab === 'weekly' ? 'monitoring-tab active' : 'monitoring-tab'}
					onClick={() => setActiveTab('weekly')}
				>
					Weekly Records
				</button>
				<button
					type="button"
					className={activeTab === 'monthly' ? 'monitoring-tab active' : 'monitoring-tab'}
					onClick={() => setActiveTab('monthly')}
				>
					All Month Records
				</button>
				{!readOnly && (
					<>
						<button
							type="button"
							className={activeTab === 'history' ? 'monitoring-tab active' : 'monitoring-tab'}
							onClick={() => setActiveTab('history')}
						>
							Submitted History
						</button>
						<button
							type="button"
							className={activeTab === 'access' ? 'monitoring-tab active' : 'monitoring-tab'}
							onClick={() => setActiveTab('access')}
						>
							Period Access
						</button>
					</>
				)}
			</div>

			{activeTab === 'daily' ? (
				<>
					<div className="daily-summary-grid">
						<div className="summary-box compact">
							<span>Total Staff</span>
							<strong>{isLoadingDirectory ? '—' : branchEmployees.length}</strong>
						</div>
						<div className="summary-box compact present-card">
							<span>Present (incl. late)</span>
							<strong>{isLoadingAttendance ? '—' : totalPresent}</strong>
						</div>
						<div className="summary-box compact late-card">
							<span>Late</span>
							<strong>{isLoadingAttendance ? '—' : totalLate}</strong>
						</div>
						<div className="summary-box compact absent-card">
							<span>Absent</span>
							<strong>{isLoadingAttendance ? '—' : totalAbsent}</strong>
						</div>
					</div>

					<div className="submit-panel">
						<div className="submit-panel-header">
							<h4>
								Mark attendance for {dailyDate.toLocaleDateString(undefined, {
									year: 'numeric', month: 'long', day: 'numeric'
								})}
							</h4>
							<label className="attendance-date-control">
								<span>Attendance date</span>
								<input
									type="date"
									value={dailyAttendanceDateKey}
									max={attendanceDateKey}
									onChange={(event) => {
										if (!event.target.value) return
										setDailyAttendanceDateKey(event.target.value)
										setSaveMessage('')
										setSaveError('')
									}}
								/>
							</label>
						</div>
						<p className="late-deduction-formula">
							Late deduction = daily rate ÷ 8 ÷ 60 × minutes late
						</p>

						<div className="attendance-submit-list">
							{isLoadingAttendance ? (
								<p className="payroll-contribution-message" role="status">Loading attendance for the selected date…</p>
							) : dailyEmployees.map((employee) => (
								<div className="attendance-row" key={employee.id}>
									<div className="employee-meta">
										<div className="employee-avatar">{employee.name.charAt(0)}</div>
										<div>
											<strong>{employee.name}</strong>
											<span>{employee.position} · Employee ID: {employee.id}</span>
										</div>
									</div>
									<div className="attendance-row-controls">
										{shiftEligibleStatuses.includes(employee.status) && (
											<label className="attendance-select-field">
												<span>Shift</span>
												<select
													value={employee.shift}
													onChange={(event) => updateShift(employee.id, event.target.value)}
													className="shift-select"
													aria-label={`Shift for ${employee.name}`}
												>
													<option value="">Select shift</option>
													{shiftOptions.map((shift) => (
														<option key={shift} value={shift}>{shift}</option>
													))}
												</select>
											</label>
										)}
										<label className="attendance-select-field">
											<span>Attendance</span>
										<select
											value={employee.status}
											onChange={(event) => updateStatus(employee.id, event.target.value)}
											className="status-select"
											aria-label={`Attendance for ${employee.name}`}
										>
											{attendanceOptions.map((option) => {
												const leavePayUnavailable = option === 'Leave with Pay'
													&& (isLoadingLeaveCredits
														|| leaveCreditError
														|| !hasLeaveCreditForDay(employee.id))
												return (
													<option
														key={option}
														value={option}
														disabled={leavePayUnavailable}
														title={leavePayUnavailable
															? 'At least 1.00 available earned leave credit is required.'
															: undefined}
													>
														{option}
													</option>
												)
											})}
										</select>
										</label>
										{employee.status === 'Present (Late)' && (
											<>
												<label className="late-minutes-field">
													<span>Minutes late</span>
													<input
														type="number"
														min="1"
														step="1"
														required
														value={employee.lateMinutes || ''}
														onChange={(event) => updateLateMinutes(employee.id, event.target.value)}
														aria-label={`Minutes late for ${employee.name}`}
													/>
												</label>
												<div className="late-deduction-value">
													<span>Deduction</span>
													<strong>
														{getLateDeduction(employee) === null
															? !Number.isFinite(employee.dailyRate) ? 'Set daily rate' : 'Enter minutes'
															: formatCurrency(getLateDeduction(employee))}
													</strong>
												</div>
											</>
										)}
									</div>
								</div>
							))}
							{!isLoadingDirectory && !isLoadingAttendance && branchEmployees.length === 0 && (
								<p className="payroll-contribution-message">There are no active employees in this branch.</p>
							)}
						</div>

						<div className="submit-action-row">
							<div className="attendance-save-feedback">
								{saveError && <span className="attendance-save-error" role="alert">{saveError}</span>}
								{saveMessage && <span className="attendance-save-success" role="status">{saveMessage}</span>}
							</div>
							<button
								type="button"
								className="save-button"
								onClick={saveAttendance}
								disabled={
									isLoadingDirectory
									|| isLoadingAttendance
									|| isSaving
									|| Boolean(loadError)
									|| dailyEmployees.length === 0
								}
							>
								{isSaving ? 'Saving…' : 'Save attendance'}
							</button>
						</div>
					</div>
				</>
			) : activeTab === 'weekly' ? (
				<>
					<div className="attendance-legend-box">
						<div className="legend-title">Weekly performance overview:</div>
						<div className="legend-items">
							{recordLegend.map((item) => (
								<span className="legend-item" key={item.className}>
									<i className={`legend-box ${item.className}`} /> {item.label}
								</span>
							))}
						</div>
					</div>
					<div className="monitoring-toolbar">
						{recordsMonthSelector}
					</div>
					<div className="weekly-summary-grid">
						{weeklyRecords.map((week, weekIndex) => (
							<button
								key={week.label}
								type="button"
								className={`weekly-card${selectedWeekIndex === weekIndex ? ' selected' : ''}`}
								aria-pressed={selectedWeekIndex === weekIndex}
								onClick={() => setSelectedWeekIndex(weekIndex)}
							>
								<span className="week-label">{week.label}</span>
								<span className="week-date-range">
									{week.days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
									{' – '}
									{week.days[week.days.length - 1].date.toLocaleDateString(undefined, {
										month: 'short', day: 'numeric', year: 'numeric'
									})}
								</span>
								<span className="week-card-prompt">View this week’s attendance</span>
								<span className="week-stat-row"><span>Present</span><strong>{week.present}</strong></span>
								<span className="week-stat-row"><span>Late</span><strong>{week.late}</strong></span>
								<span className="week-stat-row"><span>Absent</span><strong>{week.absent}</strong></span>
							</button>
						))}
					</div>

					{selectedWeek && (
						<>
							<div className="monitoring-toolbar">
								<div className="summary-inline">
									<span>Present: <strong>{weeklySummary.present}</strong></span>
									<span>Late: <strong>{weeklySummary.late}</strong></span>
									<span>Absent: <strong>{weeklySummary.absent}</strong></span>
									<span>Rate: <strong>{weeklySummary.rate}%</strong></span>
								</div>
							</div>
							<div className="attendance-grid-wrap" role="region" aria-label="Weekly attendance records" tabIndex="0">
								<table className="attendance-table weekly-attendance-table">
									<thead>
										<tr>
											<th>No.</th>
											<th>Employee name</th>
											<th>Employee ID</th>
											{selectedWeek.days.map(({ day, date }) => (
												<th key={day}>
													<span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
													<strong>{day}</strong>
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{branchEmployees.map((employee, index) => (
											<tr key={employee.id}>
												<td>{index + 1}</td>
												<td className="attendance-employee-name">{employee.name}</td>
												<td>{employee.id}</td>
												{selectedWeek.days.map(({ day }) => {
													const record = selectedWeek.records.find((item) =>
														item.employee_code === employee.id
														&& Number(item.attendance_date.slice(-2)) === day
													)
													const code = statusCodes[record?.status] ?? ''
													return (
														<td
															key={`${employee.id}-${day}`}
															className={`status-cell ${statusCodeClassNames[code] ?? ''}`}
															title={code === 'L' ? `Present (Late): ${record.late_minutes} minutes late` : undefined}
														>
															{code === 'P' ? '✓' : code === 'L' ? record.late_minutes : code}
														</td>
													)
												})}
											</tr>
										))}
										{!isLoadingAttendance && branchEmployees.length === 0 && (
											<tr>
												<td className="employee-empty-state" colSpan={selectedWeek.days.length + 3}>
													No active employees have been added to this branch.
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</>
					)}
				</>
			) : activeTab === 'access' ? (
				<>
					<div className="monitoring-toolbar">
						{recordsMonthSelector}
						<div className="summary-inline">
							<span>{selectedBranch?.branch_name ?? 'Selected branch'}</span>
							<span>Periods lock automatically after their end date.</span>
						</div>
					</div>
					<div className="attendance-period-mode">
						<strong>Period access</strong>
						<div className="attendance-period-mode-options" role="radiogroup" aria-label="Attendance period access mode">
							<label className={periodAccessMode === 'weekly' ? 'selected' : ''}>
								<input
									type="radio"
									name="attendance-period-access-mode"
									value="weekly"
									checked={periodAccessMode === 'weekly'}
									onChange={() => updatePeriodAccessMode('weekly')}
									disabled={isLoadingPeriodAccessMode || isSavingPeriodAccessMode}
								/>
								<span>Weekly</span>
								<small>Covered period, Week 1, and so on</small>
							</label>
							<label className={periodAccessMode === 'daily' ? 'selected' : ''}>
								<input
									type="radio"
									name="attendance-period-access-mode"
									value="daily"
									checked={periodAccessMode === 'daily'}
									onChange={() => updatePeriodAccessMode('daily')}
									disabled={isLoadingPeriodAccessMode || isSavingPeriodAccessMode}
								/>
								<span>Daily</span>
								<small>Each calendar day locks automatically the next day</small>
							</label>
						</div>
					</div>
					{periodControlsError && (
						<p className="payroll-contribution-message error" role="alert">
							Could not load attendance period controls: {periodControlsError}
						</p>
					)}
					{periodControlsMessage && (
						<p className="payroll-contribution-message" role="status">{periodControlsMessage}</p>
					)}
					{isLoadingPeriodAccessMode || isSavingPeriodAccessMode || isLoadingPeriodControls ? (
						<p className="payroll-contribution-message" role="status">Loading attendance period controls…</p>
					) : !periodControlsError ? (
						<div className="attendance-period-control-list">
							{controlPeriods.map((period) => {
								const control = periodControls.find((item) =>
									item.period_start === period.startDate
								)
								if (!control) return null

								return (
									<section className="attendance-period-control" key={period.startDate}>
										<div className="attendance-period-control-details">
											<strong>{period.label}</strong>
											<span>
												{formatAttendanceDate(period.startDate)}
												{' – '}
												{formatAttendanceDate(period.endDate)}
											</span>
											<span className={control.is_locked ? 'period-lock-status locked' : 'period-lock-status open'}>
												{control.is_locked ? 'Locked' : 'Open'}
												{control.is_automatic
													? ' · automatic after period end'
													: ' · TAFI Admin override'}
											</span>
											{control.pending_request_id && (
												<span className="period-unlock-request">
													Unlock requested by {control.requested_by || 'Branch Admin'}
													{control.requested_at
														? ` on ${formatSubmittedAt(control.requested_at)}`
														: ''}
												</span>
											)}
										</div>
										<button
											type="button"
											className="save-button"
											onClick={() => updatePeriodLock(period)}
											disabled={periodControlAction === period.startDate}
										>
											{periodControlAction === period.startDate
												? 'Updating…'
												: control.is_locked
													? control.pending_request_id
														? 'Approve & unlock'
														: 'Unlock period'
													: 'Lock period'}
										</button>
									</section>
								)
							})}
						</div>
					) : null}
				</>
			) : activeTab === 'history' ? (
				<>
					<div className="monitoring-toolbar">
						<div className="summary-inline">
							<span>Daily attendance submissions from all branches</span>
						</div>
						<button
							type="button"
							className="save-button"
							onClick={refreshSubmissionHistory}
							disabled={isLoadingHistory}
						>
							Refresh
						</button>
					</div>
					{historyError && (
						<p className="payroll-contribution-message error" role="alert">
							Could not load submitted attendance history: {historyError}
						</p>
					)}
					{isLoadingHistory && submissionHistory.length === 0 ? (
						<p className="payroll-contribution-message" role="status">Loading submitted attendance history…</p>
					) : (
						<div className="attendance-grid-wrap" role="region" aria-label="Submitted attendance history" tabIndex="0">
							<table className="attendance-table">
								<thead>
									<tr>
										<th>Branch</th>
										<th>Branch Admin / TAFI Admin</th>
										<th>Attendance Date</th>
										<th>Submitted Date &amp; Time</th>
										<th>Employees</th>
									</tr>
								</thead>
								<tbody>
									{submissionHistory.map((submission) => (
										<tr key={submission.id}>
											<td>{submission.branch_name}</td>
											<td>{submission.submitted_by_role}: {submission.submitted_by_name}</td>
											<td>{formatAttendanceDate(submission.attendance_date)}</td>
											<td>{formatSubmittedAt(submission.submitted_at)}</td>
											<td>{submission.employee_count}</td>
										</tr>
									))}
									{!isLoadingHistory && !historyError && submissionHistory.length === 0 && (
										<tr>
											<td className="employee-empty-state" colSpan="5">
												No branch attendance submissions have been recorded yet.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					)}
					{hasMoreHistory && (
						<div className="submit-action-row">
							<button
								type="button"
								className="save-button"
								onClick={loadOlderSubmissions}
								disabled={isLoadingHistory}
							>
								{isLoadingHistory ? 'Loading…' : 'Load older submissions'}
							</button>
						</div>
					)}
				</>
			) : (
				<>
					<div className="attendance-legend-box">
						<div className="legend-title">Monthly attendance legend:</div>
						<div className="legend-items">
							{recordLegend.map((item) => (
								<span className="legend-item" key={item.className}>
									<i className={`legend-box ${item.className}`} /> {item.label}
								</span>
							))}
							<span className="legend-item">Excellent attendance: 100%</span>
							<span className="legend-item">Good attendance: 60%–99%</span>
							<span className="legend-item">Poor attendance: below 60%</span>
						</div>
					</div>
					<div className="monitoring-toolbar">
						{recordsMonthSelector}
						<div className="month-select">
							{new Date(monthDates.year, monthDates.monthIndex, 1)
								.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
						</div>
						<div className="summary-inline">
							<span>Present: <strong>{summary.present}</strong></span>
							<span>Late: <strong>{summary.late}</strong></span>
							<span>Absent: <strong>{summary.absent}</strong></span>
							<span>Rate: <strong>{summary.rate}%</strong></span>
						</div>
					</div>
					<div className="attendance-grid-wrap" role="region" aria-label="Monthly attendance records" tabIndex="0">
						<table className="attendance-table monthly-attendance-table">
							<colgroup>
								<col className="attendance-col-number" />
								<col className="attendance-col-name" />
								<col className="attendance-col-id" />
								{Array.from({ length: monthDates.days }, (_, index) => (
									<col key={`month-col-${index + 1}`} className="attendance-col-day" />
								))}
								{Array.from({ length: 6 }, (_, index) => (
									<col key={`summary-col-${index + 1}`} className="attendance-col-total" />
								))}
								<col className="attendance-col-rate" />
								<col className="attendance-col-remarks" />
							</colgroup>
							<thead>
								<tr>
									<th rowSpan="2">No.</th>
									<th rowSpan="2">Employee name</th>
									<th rowSpan="2">Employee ID</th>
									{Array.from({ length: monthDates.days }, (_, index) => (
										<th key={`month-day-${index + 1}`}>{index + 1}</th>
									))}
									<th rowSpan="2">Total Present</th>
									<th rowSpan="2">Total Late (minutes)</th>
									<th rowSpan="2">Total Undertime (minutes)</th>
									<th rowSpan="2">Total Overtime (hours)</th>
									<th rowSpan="2">Earned Credit (days)</th>
									<th rowSpan="2">Total Days</th>
									<th rowSpan="2">Attendance Rate (%)</th>
									<th rowSpan="2">Remarks</th>
								</tr>
							</thead>
							<tbody>
								{monthRecords.map((employee) => (
									<tr key={employee.id}>
										<td>{employee.no}</td>
										<td className="attendance-employee-name">{employee.name}</td>
										<td>{employee.id}</td>
										{employee.days.map((value, index) => (
											<td
												key={`${employee.id}-${index}`}
												className={`status-cell ${statusCodeClassNames[value] ?? ''}`}
												title={value === 'L'
													? `Present (Late): ${employee.lateMinutesByDay[index]} minutes late`
													: undefined}
											>
												{value === 'P' ? '✓' : value === 'L'
													? employee.lateMinutesByDay[index]
													: value}
											</td>
										))}
										<td>{employee.presentDays}</td>
										<td>{employee.lateMinutes}</td>
										<td>{employee.undertimeMinutes === null ? '—' : employee.undertimeMinutes}</td>
										<td>{employee.overtimeHours === null ? '—' : employee.overtimeHours.toFixed(2)}</td>
										<td>{employee.earnedCredit.toFixed(2)}</td>
										<td>{employee.totalDays}</td>
										<td>{employee.attendanceRate}%</td>
										<td>{employee.attendanceRemark}</td>
									</tr>
								))}
								{!isLoadingAttendance && monthRecords.length === 0 && (
									<tr>
										<td className="employee-empty-state" colSpan={monthDates.days + 11}>
											No active employees have been added to this branch.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					{monthlyMetricsError && (
						<p className="payroll-contribution-message error" role="alert">
							Some monthly overtime or undertime totals could not be loaded: {monthlyMetricsError}
						</p>
					)}
				</>
			)}
		</div>
	)
}
