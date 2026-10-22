import { useEffect, useState } from 'react'
import {
	listTafiAdminBranches,
	listTafiAdminBranchInventoryMonthlyUsage,
	listTafiAdminBranchInventoryUsageHistory
} from '../../lib/supabase'

const formatQuantity = (value) => Number(value).toLocaleString(undefined, {
	maximumFractionDigits: 3
})

export default function TafiInventoryLog({ sessionToken }) {
	const [branches, setBranches] = useState([])
	const [selectedBranchId, setSelectedBranchId] = useState('')
	const [activeTab, setActiveTab] = useState('daily')
	const [currentDate, setCurrentDate] = useState('')
	const [selectedDate, setSelectedDate] = useState('')
	const [selectedMonth, setSelectedMonth] = useState('')
	const [dailyItems, setDailyItems] = useState([])
	const [monthlyItems, setMonthlyItems] = useState([])
	const [isBranchesLoading, setIsBranchesLoading] = useState(true)
	const [isDailyLoading, setIsDailyLoading] = useState(false)
	const [isMonthlyLoading, setIsMonthlyLoading] = useState(false)
	const [branchError, setBranchError] = useState('')
	const [dailyError, setDailyError] = useState('')
	const [monthlyError, setMonthlyError] = useState('')

	useEffect(() => {
		let isCurrent = true

		const loadBranches = async () => {
			if (!sessionToken) {
				setIsBranchesLoading(false)
				setBranchError('TAFI Admin session is unavailable. Please sign in again.')
				return
			}

			const { data, error } = await listTafiAdminBranches(sessionToken)
			if (!isCurrent) return
			setIsBranchesLoading(false)
			if (error) {
				setBranchError(error.message)
				return
			}

			const branchList = (data ?? []).filter((branch) => branch.branch_name !== 'TAFI - HO')
			const today = new Intl.DateTimeFormat('en-CA', {
				timeZone: 'Asia/Manila',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(new Date())
			setBranchError('')
			setBranches(branchList)
			setSelectedBranchId(branchList[0]?.branch_id ?? '')
			setCurrentDate(today)
			setSelectedDate(today)
			setSelectedMonth(today.slice(0, 7))
		}

		loadBranches()
		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		if (!sessionToken || !selectedBranchId || !selectedDate) {
			return undefined
		}

		let isCurrent = true
		const loadDailyHistory = async () => {
			setIsDailyLoading(true)
			setDailyError('')
			const { data, error } = await listTafiAdminBranchInventoryUsageHistory(
				sessionToken,
				selectedBranchId,
				selectedDate
			)
			if (!isCurrent) return
			setIsDailyLoading(false)
			if (error) {
				setDailyError(error.message)
				return
			}

			setDailyItems(data ?? [])
		}

		loadDailyHistory()
		return () => {
			isCurrent = false
		}
	}, [selectedBranchId, selectedDate, sessionToken])

	useEffect(() => {
		if (!sessionToken || !selectedBranchId || !selectedMonth) {
			return undefined
		}

		let isCurrent = true
		const loadMonthlyUsage = async () => {
			setIsMonthlyLoading(true)
			setMonthlyError('')
			const { data, error } = await listTafiAdminBranchInventoryMonthlyUsage(
				sessionToken,
				selectedBranchId,
				`${selectedMonth}-01`
			)
			if (!isCurrent) return
			setIsMonthlyLoading(false)
			if (error) {
				setMonthlyError(error.message)
				return
			}

			setMonthlyItems(data ?? [])
		}

		loadMonthlyUsage()
		return () => {
			isCurrent = false
		}
	}, [selectedBranchId, selectedMonth, sessionToken])

	const selectedBranch = branches.find((branch) => branch.branch_id === selectedBranchId)
	const handleBranchChange = (event) => {
		setDailyItems([])
		setMonthlyItems([])
		setDailyError('')
		setMonthlyError('')
		setSelectedBranchId(event.target.value)
	}
	const handleDateChange = (event) => {
		setDailyItems([])
		setDailyError('')
		setIsDailyLoading(false)
		setSelectedDate(event.target.value)
	}
	const handleMonthChange = (event) => {
		setMonthlyItems([])
		setMonthlyError('')
		setIsMonthlyLoading(false)
		setSelectedMonth(event.target.value)
	}

	return (
		<section className="accountant-inventory-section">
			{branchError && <p className="accountant-inventory-error" role="alert">{branchError}</p>}
			{isBranchesLoading ? (
				<p className="accountant-inventory-empty" role="status">Loading branches...</p>
			) : branches.length ? (
				<>
					<div className="accountant-inventory-list-heading">
						<div>
							<h2>Branch Inventory Usage</h2>
							<p>Select a branch to review its daily and monthly inventory usage.</p>
						</div>
						<label className="branch-inventory-history-date">
							<span>Branch</span>
							<select
								value={selectedBranchId}
								onChange={handleBranchChange}
							>
								{branches.map((branch) => (
									<option key={branch.branch_id} value={branch.branch_id}>
										{branch.branch_name}
									</option>
								))}
							</select>
						</label>
					</div>
					{selectedBranch && (
						<p className="accountant-inventory-empty">
							Showing usage for {selectedBranch.branch_name}
							{selectedBranch.branch_location ? ` · ${selectedBranch.branch_location}` : ''}.
						</p>
					)}

					<div className="accountant-inventory-tabs" role="tablist" aria-label="Branch inventory usage reports">
						<button
							type="button"
							id="tafi-daily-usage-tab"
							className={`accountant-inventory-tab${activeTab === 'daily' ? ' active' : ''}`}
							role="tab"
							aria-selected={activeTab === 'daily'}
							aria-controls="tafi-daily-usage-panel"
							onClick={() => setActiveTab('daily')}
						>
							Daily Usage History
						</button>
						<button
							type="button"
							id="tafi-monthly-usage-tab"
							className={`accountant-inventory-tab${activeTab === 'monthly' ? ' active' : ''}`}
							role="tab"
							aria-selected={activeTab === 'monthly'}
							aria-controls="tafi-monthly-usage-panel"
							onClick={() => setActiveTab('monthly')}
						>
							Monthly Usage
						</button>
					</div>

					<div
						id="tafi-daily-usage-panel"
						className="accountant-inventory-panel"
						role="tabpanel"
						aria-labelledby="tafi-daily-usage-tab"
						hidden={activeTab !== 'daily'}
					>
						<div className="accountant-inventory-list-heading">
							<div>
								<h3>Daily Usage History</h3>
								<p>{selectedBranch?.branch_name}{selectedDate ? ` · ${selectedDate}` : ''}</p>
							</div>
							<label className="branch-inventory-history-date">
								<span>History date</span>
								<input
									type="date"
									value={selectedDate}
									max={currentDate}
									onChange={handleDateChange}
								/>
							</label>
						</div>
						{dailyError && <p className="accountant-inventory-error" role="alert">{dailyError}</p>}
						{isDailyLoading ? (
							<p className="accountant-inventory-empty" role="status">Loading daily usage history...</p>
						) : dailyItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Branch</th>
											<th scope="col">Stock no.</th>
											<th scope="col">Category</th>
											<th scope="col">Item description</th>
											<th scope="col">Unit of measure</th>
											<th scope="col">Beginning stock</th>
											<th scope="col">Usage</th>
											<th scope="col">Ending stock</th>
										</tr>
									</thead>
									<tbody>
										{dailyItems.map((item) => (
											<tr key={item.branch_inventory_id}>
												<td>{item.branch_name}</td>
												<td>{item.stock_no}</td>
												<td>{item.category}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{formatQuantity(item.beginning_stock)}</td>
												<td>{formatQuantity(item.usage_quantity)}</td>
												<td>{formatQuantity(item.ending_stock)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : !dailyError ? (
							<p className="accountant-inventory-empty">
								No usage was recorded for {selectedDate} at this branch.
							</p>
						) : null}
					</div>

					<div
						id="tafi-monthly-usage-panel"
						className="accountant-inventory-panel"
						role="tabpanel"
						aria-labelledby="tafi-monthly-usage-tab"
						hidden={activeTab !== 'monthly'}
					>
						<div className="accountant-inventory-list-heading">
							<div>
								<h3>Monthly Usage</h3>
								<p>{selectedBranch?.branch_name}{selectedMonth ? ` · ${selectedMonth}` : ''}</p>
							</div>
							<label className="branch-inventory-history-date">
								<span>Usage month</span>
								<input
									type="month"
									value={selectedMonth}
									max={currentDate.slice(0, 7)}
									onChange={handleMonthChange}
								/>
							</label>
						</div>
						{monthlyError && <p className="accountant-inventory-error" role="alert">{monthlyError}</p>}
						{isMonthlyLoading ? (
							<p className="accountant-inventory-empty" role="status">Loading monthly usage...</p>
						) : monthlyItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
											<th scope="col">Branch</th>
											<th scope="col">Stock no.</th>
											<th scope="col">Category</th>
											<th scope="col">Item description</th>
											<th scope="col">Unit of measure</th>
											<th scope="col">Total usage</th>
											<th scope="col">Days recorded</th>
										</tr>
									</thead>
									<tbody>
										{monthlyItems.map((item) => (
											<tr key={item.branch_inventory_id}>
												<td>{item.branch_name}</td>
												<td>{item.stock_no}</td>
												<td>{item.category}</td>
												<td>{item.item_description}</td>
												<td>{item.unit_of_measure}</td>
												<td>{formatQuantity(item.usage_total)}</td>
												<td>{item.days_recorded}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : !monthlyError ? (
							<p className="accountant-inventory-empty">
								No branch inventory items were found for {selectedBranch?.branch_name}.
							</p>
						) : null}
					</div>
				</>
			) : !branchError ? (
				<p className="accountant-inventory-empty">No branches are available.</p>
			) : null}
		</section>
	)
}