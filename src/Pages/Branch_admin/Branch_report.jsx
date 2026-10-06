import { useState } from 'react'
import { getBranchEmployees } from './branchEmployees'
import { monthRecords } from './Branch_attendance_monitoring'

const monthName = 'January'
const reportYear = 2026
const monthDayCount = monthRecords.reduce(
	(longestMonth, record) => Math.max(longestMonth, record.days.length),
	0
)
const weekCount = Math.max(1, Math.ceil(monthDayCount / 7))
const statusLabels = { P: 'Present', L: 'Late', A: 'Absent' }

const csvCell = (value) => {
	const text = String(value ?? '')
	const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
	return `"${safeText.replaceAll('"', '""')}"`
}

const createCsv = (rows) => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`

const getPeriod = (periodType, weekIndex) => {
	const startDay = periodType === 'weekly' ? weekIndex * 7 + 1 : 1
	const endDay = periodType === 'weekly'
		? Math.min((weekIndex + 1) * 7, monthDayCount)
		: monthDayCount

	return { startDay, endDay }
}

const periodDescription = (periodType, weekIndex) => {
	const { startDay, endDay } = getPeriod(periodType, weekIndex)
	return periodType === 'weekly'
		? `Week ${weekIndex + 1} (${monthName} ${startDay}-${endDay}, ${reportYear})`
		: `${monthName} ${reportYear}`
}

const downloadCsv = (fileName, rows) => {
	const blob = new Blob([createCsv(rows)], { type: 'text/csv;charset=utf-8' })
	const downloadUrl = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = downloadUrl
	link.download = fileName
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(downloadUrl)
}

function PeriodControls({ periodType, onPeriodTypeChange, weekIndex, onWeekChange, id }) {
	return (
		<div className="report-controls">
			<label>
				<span>Report period</span>
				<select value={periodType} onChange={(event) => onPeriodTypeChange(event.target.value)}>
					<option value="weekly">Weekly</option>
					<option value="monthly">Monthly</option>
				</select>
			</label>
			{periodType === 'weekly' && (
				<label>
					<span>Week</span>
					<select value={weekIndex} onChange={(event) => onWeekChange(Number(event.target.value))}>
						{Array.from({ length: weekCount }, (_, index) => {
							const period = getPeriod('weekly', index)
							return (
								<option key={`${id}-week-${index}`} value={index}>
									Week {index + 1}: {monthName} {period.startDay}-{period.endDay}
								</option>
							)
						})}
					</select>
				</label>
			)}
			<p className="report-period-note">Source records: {monthName} {reportYear}</p>
		</div>
	)
}

export default function BranchReport({ branchName = 'Bansasi Branch' }) {
	const [attendancePeriodType, setAttendancePeriodType] = useState('weekly')
	const [attendanceWeekIndex, setAttendanceWeekIndex] = useState(0)
	const [payrollPeriodType, setPayrollPeriodType] = useState('weekly')
	const [payrollWeekIndex, setPayrollWeekIndex] = useState(0)
	const [attendanceMessage, setAttendanceMessage] = useState('')
	const [payrollMessage, setPayrollMessage] = useState('')

	const generateAttendanceReport = () => {
		const { startDay, endDay } = getPeriod(attendancePeriodType, attendanceWeekIndex)
		const days = Array.from({ length: endDay - startDay + 1 }, (_, index) => startDay + index)
		const attendanceById = new Map(monthRecords.map((record) => [record.id, record]))
		const rows = [
			['Employee ID', 'Employee Name', 'Position', ...days.map((day) => `${monthName} ${day}`), 'Present', 'Late', 'Absent']
		]

		for (const employee of getBranchEmployees()) {
			const record = attendanceById.get(employee.id)
			const statuses = days.map((day) => statusLabels[record?.days[day - 1]] ?? '')
			rows.push([
				employee.id,
				employee.name,
				employee.position,
				...statuses,
				statuses.filter((status) => status === 'Present').length,
				statuses.filter((status) => status === 'Late').length,
				statuses.filter((status) => status === 'Absent').length
			])
		}

		const description = periodDescription(attendancePeriodType, attendanceWeekIndex)
		const suffix = attendancePeriodType === 'weekly'
			? `week-${attendanceWeekIndex + 1}`
			: 'monthly'
		downloadCsv(`attendance-${suffix}-${monthName.toLowerCase()}-${reportYear}.csv`, rows)
		setAttendanceMessage(`Downloaded attendance report for ${description}.`)
	}

	const generatePayrollReport = () => {
		const { startDay, endDay } = getPeriod(payrollPeriodType, payrollWeekIndex)
		const attendanceById = new Map(monthRecords.map((record) => [record.id, record]))
		const rows = [[
			'Employee ID', 'Employee Name', 'Position', 'Present Days', 'Late Days', 'Absent Days',
			'Daily Rate (PHP)', 'Estimated Gross (PHP)', 'Record Status'
		]]
		let estimatedTotal = 0
		let calculatedEmployees = 0

		for (const employee of getBranchEmployees()) {
			const record = attendanceById.get(employee.id)
			const days = record?.days.slice(startDay - 1, endDay) ?? []
			const presentDays = days.filter((day) => day === 'P').length
			const lateDays = days.filter((day) => day === 'L').length
			const absentDays = days.filter((day) => day === 'A').length
			const dailyRate = Number.isFinite(employee.dailyRate) ? employee.dailyRate : null
			const gross = record && dailyRate !== null ? (presentDays + lateDays) * dailyRate : null

			if (gross !== null) {
				estimatedTotal += gross
				calculatedEmployees += 1
			}

			rows.push([
				employee.id,
				employee.name,
				employee.position,
				record ? presentDays : '',
				record ? lateDays : '',
				record ? absentDays : '',
				dailyRate ?? '',
				gross ?? '',
				gross === null ? 'Needs rate or attendance' : 'Estimated'
			])
		}

		rows.push([])
		rows.push(['Estimated gross total for calculated employees', calculatedEmployees ? estimatedTotal.toFixed(2) : 'Awaiting data'])
		rows.push(['Calculation', 'Present and late days multiplied by daily rate; excludes overtime, allowances, and deductions'])

		const description = periodDescription(payrollPeriodType, payrollWeekIndex)
		const suffix = payrollPeriodType === 'weekly'
			? `week-${payrollWeekIndex + 1}`
			: 'monthly'
		downloadCsv(`payroll-${suffix}-${monthName.toLowerCase()}-${reportYear}.csv`, rows)
		setPayrollMessage(`Downloaded payroll report for ${description}.`)
	}

	return (
		<section className="branch-report-page">
			<header className="branch-report-header">
				<p className="employee-info-eyebrow">{branchName}</p>
				<h3>Branch Reports</h3>
				<p className="employee-info-description">Generate attendance and payroll files separately.</p>
			</header>

			<section className="report-section">
				<div className="report-section-heading">
					<div>
						<h4>Attendance report</h4>
						<p>Export daily attendance statuses and period totals.</p>
					</div>
					<button type="button" className="report-download-button" onClick={generateAttendanceReport}>
						Download attendance CSV
					</button>
				</div>
				<PeriodControls
					id="attendance"
					periodType={attendancePeriodType}
					onPeriodTypeChange={setAttendancePeriodType}
					weekIndex={attendanceWeekIndex}
					onWeekChange={setAttendanceWeekIndex}
				/>
				{attendanceMessage && <p className="report-download-message" role="status">{attendanceMessage}</p>}
			</section>

			<section className="report-section">
				<div className="report-section-heading">
					<div>
						<h4>Payroll report</h4>
						<p>Export attendance-based gross estimates using saved employee rates.</p>
					</div>
					<button type="button" className="report-download-button" onClick={generatePayrollReport}>
						Download payroll CSV
					</button>
				</div>
				<PeriodControls
					id="payroll"
					periodType={payrollPeriodType}
					onPeriodTypeChange={setPayrollPeriodType}
					weekIndex={payrollWeekIndex}
					onWeekChange={setPayrollWeekIndex}
				/>
				{payrollMessage && <p className="report-download-message" role="status">{payrollMessage}</p>}
			</section>

			<p className="report-data-note">
				Reports use the currently available January 2026 records. Payroll exports are estimates, not confirmed payments.
			</p>
		</section>
	)
}
