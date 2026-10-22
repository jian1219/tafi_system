import { useEffect, useState } from 'react'
import {
	listBranchAdminInventoryDailyLog,
	listBranchAdminInventoryMonthlyUsage,
	listBranchAdminInventoryUsageDates,
	listBranchAdminInventoryUsageHistory,
	recordBranchAdminInventoryDailyUsage
} from '../../lib/supabase'

const formatQuantity = (value) => Number(value).toLocaleString(undefined, {
	maximumFractionDigits: 3
})

export default function BranchInventoryLog({ branchName = 'Branch', branchAdmin }) {
	const sessionToken = branchAdmin?.session_token
	const [activeTab, setActiveTab] = useState('daily')
	const [selectedMonth, setSelectedMonth] = useState('')
	const [inventoryItems, setInventoryItems] = useState([])
	const [usageInputs, setUsageInputs] = useState({})
	const [selectedHistoryDate, setSelectedHistoryDate] = useState('')
	const [historyItems, setHistoryItems] = useState([])
	const [monthlyItems, setMonthlyItems] = useState([])
	const [isLoading, setIsLoading] = useState(Boolean(sessionToken))
	const [isHistoryLoading, setIsHistoryLoading] = useState(Boolean(sessionToken))
	const [isMonthlyLoading, setIsMonthlyLoading] = useState(Boolean(sessionToken))
	const [savingItemId, setSavingItemId] = useState('')
	const [loadError, setLoadError] = useState('')
	const [historyError, setHistoryError] = useState('')
	const [monthlyError, setMonthlyError] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [notice, setNotice] = useState('')

	useEffect(() => {
		let isCurrent = true

		const loadInventoryLog = async () => {
			const [dailyLogResult, historyDatesResult] = await Promise.all([
				listBranchAdminInventoryDailyLog(sessionToken),
				listBranchAdminInventoryUsageDates(sessionToken)
			])
			if (!isCurrent) return
			setIsLoading(false)
			const dailyItems = dailyLogResult.data ?? []
			if (dailyLogResult.error) {
				setLoadError(dailyLogResult.error.message)
			} else {
				setLoadError('')
				setInventoryItems(dailyItems)
				setUsageInputs(Object.fromEntries(
					dailyItems.map((item) => [item.branch_inventory_id, String(item.usage_quantity)])
				))
			}

			if (historyDatesResult.error) {
				setHistoryError(historyDatesResult.error.message)
				setIsHistoryLoading(false)
				const currentDate = dailyItems[0]?.usage_date ?? ''
				setSelectedMonth(currentDate.slice(0, 7))
				if (!currentDate) setIsMonthlyLoading(false)
				return
			}

			setHistoryError('')
			const dates = (historyDatesResult.data ?? []).map((row) => row.usage_date)
			setSelectedHistoryDate(dates[0] ?? '')
			const currentDate = dailyItems[0]?.usage_date ?? dates[0] ?? ''
			setSelectedMonth(currentDate.slice(0, 7))
			if (!dates.length) setIsHistoryLoading(false)
			if (!currentDate) setIsMonthlyLoading(false)
		}

		if (sessionToken) {
			loadInventoryLog()
		}

		return () => {
			isCurrent = false
		}
	}, [sessionToken])

	useEffect(() => {
		if (!sessionToken || !selectedHistoryDate) return undefined

		let isCurrent = true
		const loadHistory = async () => {
			const { data, error } = await listBranchAdminInventoryUsageHistory(
				sessionToken,
				selectedHistoryDate
			)
			if (!isCurrent) return
			setIsHistoryLoading(false)
			if (error) {
				setHistoryError(error.message)
				return
			}

			setHistoryError('')
			setHistoryItems(data ?? [])
		}

		loadHistory()
		return () => {
			isCurrent = false
		}
	}, [selectedHistoryDate, sessionToken])

	useEffect(() => {
		if (!sessionToken || !selectedMonth) return undefined

		let isCurrent = true
		const loadMonthlyUsage = async () => {
			const { data, error } = await listBranchAdminInventoryMonthlyUsage(
				sessionToken,
				`${selectedMonth}-01`
			)
			if (!isCurrent) return
			setIsMonthlyLoading(false)
			if (error) {
				setMonthlyError(error.message)
				return
			}

			setMonthlyError('')
			setMonthlyItems(data ?? [])
		}

		loadMonthlyUsage()
		return () => {
			isCurrent = false
		}
	}, [selectedMonth, sessionToken])

	const handleUsageChange = (branchInventoryId, value) => {
		setUsageInputs((current) => ({ ...current, [branchInventoryId]: value }))
	}

	const handleSaveUsage = async (item) => {
		const usageValue = usageInputs[item.branch_inventory_id] ?? ''
		const usageQuantity = Number(usageValue)
		if (!usageValue.trim() || !Number.isFinite(usageQuantity) || usageQuantity < 0) {
			setErrorMessage('Enter a daily usage quantity of zero or greater.')
			setNotice('')
			return
		}

		if (Math.abs(usageQuantity * 1000 - Math.round(usageQuantity * 1000)) > 0.000001) {
			setErrorMessage('Daily usage can have up to three decimal places.')
			setNotice('')
			return
		}

		if (usageQuantity > Number(item.beginning_stock)) {
			setErrorMessage(`Daily usage for ${item.stock_no} cannot exceed its beginning stock.`)
			setNotice('')
			return
		}

		setSavingItemId(item.branch_inventory_id)
		setErrorMessage('')
		setNotice('')
		const { error } = await recordBranchAdminInventoryDailyUsage(
			sessionToken,
			item.branch_inventory_id,
			usageQuantity
		)
		setSavingItemId('')

		if (error) {
			setErrorMessage(error.message)
			return
		}

		setInventoryItems((current) => current.map((currentItem) => (
			currentItem.branch_inventory_id === item.branch_inventory_id
				? {
					...currentItem,
					usage_quantity: usageQuantity,
					ending_stock: Number(currentItem.beginning_stock) - usageQuantity
				}
				: currentItem
		)))
		const historyEntry = {
			usage_date: item.usage_date,
			branch_inventory_id: item.branch_inventory_id,
			stock_no: item.stock_no,
			category: item.category,
			item_description: item.item_description,
			unit_of_measure: item.unit_of_measure,
			beginning_stock: item.beginning_stock,
			usage_quantity: usageQuantity,
			ending_stock: Number(item.beginning_stock) - usageQuantity
		}
		if (selectedHistoryDate === item.usage_date) {
			setHistoryItems((current) => {
				const alreadyLogged = current.some(
					(historyItem) => historyItem.branch_inventory_id === item.branch_inventory_id
				)
				return alreadyLogged
					? current.map((historyItem) => (
						historyItem.branch_inventory_id === item.branch_inventory_id
							? historyEntry
							: historyItem
					))
					: [...current, historyEntry]
			})
		} else {
			setIsHistoryLoading(true)
			setHistoryItems([])
		}
		setSelectedHistoryDate(item.usage_date)
		setHistoryError('')
		if (selectedMonth === item.usage_date.slice(0, 7)) {
			setIsMonthlyLoading(true)
			const { data, error: monthlyRefreshError } = await listBranchAdminInventoryMonthlyUsage(
				sessionToken,
				`${selectedMonth}-01`
			)
			setIsMonthlyLoading(false)
			if (monthlyRefreshError) {
				setMonthlyError(`Usage was saved, but monthly totals could not refresh: ${monthlyRefreshError.message}`)
			} else {
				setMonthlyError('')
				setMonthlyItems(data ?? [])
			}
		}
		setNotice(`Daily usage saved for ${item.stock_no}. Branch Inventory has been updated.`)
	}

	const usageDate = inventoryItems[0]?.usage_date
	const visibleLoadError = loadError
		|| (!sessionToken ? 'Branch Admin session is unavailable. Please sign in again.' : '')
	const handleHistoryDateChange = (event) => {
		setIsHistoryLoading(Boolean(event.target.value))
		setHistoryError('')
		setHistoryItems([])
		setSelectedHistoryDate(event.target.value)
	}
	const handleMonthChange = (event) => {
		setIsMonthlyLoading(Boolean(event.target.value))
		setMonthlyError('')
		setMonthlyItems([])
		setSelectedMonth(event.target.value)
	}

	return (
		<section className="accountant-inventory-section">
			<div className="accountant-inventory-tabs" role="tablist" aria-label="Branch inventory log">
				<button
					type="button"
					id="daily-inventory-use-tab"
					className={`accountant-inventory-tab${activeTab === 'daily' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'daily'}
					aria-controls="daily-inventory-use-panel"
					onClick={() => setActiveTab('daily')}
				>
					Daily Inventory Use
				</button>
				<button
					type="button"
					id="daily-usage-history-tab"
					className={`accountant-inventory-tab${activeTab === 'history' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'history'}
					aria-controls="daily-usage-history-panel"
					onClick={() => setActiveTab('history')}
				>
					Daily Usage History
				</button>
				<button
					type="button"
					id="monthly-usage-tab"
					className={`accountant-inventory-tab${activeTab === 'monthly' ? ' active' : ''}`}
					role="tab"
					aria-selected={activeTab === 'monthly'}
					aria-controls="monthly-usage-panel"
					onClick={() => setActiveTab('monthly')}
				>
					Monthly Usage
				</button>
			</div>

			<div
				id="daily-inventory-use-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="daily-inventory-use-tab"
				hidden={activeTab !== 'daily'}
			>
				<div className="accountant-inventory-list-heading">
					<div>
						<h2>Daily Inventory Use</h2>
						<p>{usageDate ? `${branchName} · ${usageDate}` : branchName}</p>
						<p>Save each item&apos;s daily usage to deduct it from Branch Inventory.</p>
					</div>
				</div>

				{visibleLoadError && <p className="accountant-inventory-error" role="alert">{visibleLoadError}</p>}
				{errorMessage && <p className="accountant-inventory-error" role="alert">{errorMessage}</p>}
				{notice && <p className="accountant-inventory-notice" role="status">{notice}</p>}

				{isLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading daily inventory...</p>
				) : inventoryItems.length ? (
					<div className="accountant-inventory-table-wrap">
						<table className="accountant-inventory-table">
							<thead>
								<tr>
									<th scope="col">Stock no.</th>
									<th scope="col">Category</th>
									<th scope="col">Item description</th>
									<th scope="col">Unit of measure</th>
									<th scope="col">Beginning stock</th>
									<th scope="col">Usage</th>
									<th scope="col">Ending stock</th>
									<th scope="col">Action</th>
								</tr>
							</thead>
							<tbody>
								{inventoryItems.map((item) => {
									const usageValue = usageInputs[item.branch_inventory_id] ?? ''
									const usageQuantity = usageValue === '' ? Number.NaN : Number(usageValue)
									const endingStock = Number(item.beginning_stock) - usageQuantity

									return (
										<tr key={item.branch_inventory_id}>
											<td>{item.stock_no}</td>
											<td>{item.category}</td>
											<td>{item.item_description}</td>
											<td>{item.unit_of_measure}</td>
											<td>{formatQuantity(item.beginning_stock)}</td>
											<td>
												<input
													className="branch-inventory-log-usage-input"
													type="number"
													min="0"
													max={item.beginning_stock}
													step="0.001"
													value={usageValue}
													onChange={(event) => handleUsageChange(item.branch_inventory_id, event.target.value)}
													aria-label={`Usage today for ${item.stock_no}`}
												/>
											</td>
											<td>{Number.isFinite(endingStock) ? formatQuantity(endingStock) : '—'}</td>
											<td>
												<button
													type="button"
													className="accountant-inventory-add-toggle"
													disabled={Boolean(savingItemId)}
													onClick={() => handleSaveUsage(item)}
												>
													{savingItemId === item.branch_inventory_id ? 'Saving...' : 'Save'}
												</button>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				) : !visibleLoadError ? (
					<p className="accountant-inventory-empty">No items have been added to this branch inventory yet.</p>
				) : null}
			</div>

			<div
				id="daily-usage-history-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="daily-usage-history-tab"
				hidden={activeTab !== 'history'}
			>
				<section className="branch-inventory-log-history" aria-labelledby="branch-inventory-history-title">
				<div className="accountant-inventory-list-heading">
					<div>
						<h2 id="branch-inventory-history-title">Daily Usage History</h2>
						<p>Review saved inventory usage by date.</p>
					</div>
					<label className="branch-inventory-history-date">
						<span>History date</span>
						<input
							type="date"
							value={selectedHistoryDate}
							max={usageDate}
							onChange={handleHistoryDateChange}
						/>
					</label>
				</div>
				{historyError && <p className="accountant-inventory-error" role="alert">{historyError}</p>}
				{isHistoryLoading ? (
					<p className="accountant-inventory-empty" role="status">Loading usage history...</p>
				) : selectedHistoryDate ? (
					historyItems.length ? (
						<div className="accountant-inventory-table-wrap">
							<table className="accountant-inventory-table">
								<thead>
									<tr>
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
									{historyItems.map((item) => (
										<tr key={item.branch_inventory_id}>
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
					) : !historyError ? (
						<p className="accountant-inventory-empty">No usage was recorded for {selectedHistoryDate}.</p>
					) : null
				) : !historyError ? (
					<p className="accountant-inventory-empty">No saved daily usage history yet.</p>
				) : null}
				</section>
			</div>

			<div
				id="monthly-usage-panel"
				className="accountant-inventory-panel"
				role="tabpanel"
				aria-labelledby="monthly-usage-tab"
				hidden={activeTab !== 'monthly'}
			>
				<section className="branch-inventory-log-history" aria-labelledby="monthly-usage-title">
					<div className="accountant-inventory-list-heading">
						<div>
							<h2 id="monthly-usage-title">Monthly Usage</h2>
							<p>{branchName}{selectedMonth ? ` · ${selectedMonth}` : ''}</p>
							<p>Total recorded usage for each inventory item in the selected month.</p>
						</div>
						<label className="branch-inventory-history-date">
							<span>Usage month</span>
							<input
								type="month"
								value={selectedMonth}
								max={usageDate?.slice(0, 7)}
								onChange={handleMonthChange}
							/>
						</label>
					</div>
					{monthlyError && <p className="accountant-inventory-error" role="alert">{monthlyError}</p>}
					{isMonthlyLoading ? (
						<p className="accountant-inventory-empty" role="status">Loading monthly usage...</p>
					) : selectedMonth ? (
						monthlyItems.length ? (
							<div className="accountant-inventory-table-wrap">
								<table className="accountant-inventory-table">
									<thead>
										<tr>
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
							<p className="accountant-inventory-empty">No items have been added to this branch inventory yet.</p>
						) : null
					) : !monthlyError ? (
						<p className="accountant-inventory-empty">Select a month to view usage.</p>
					) : null}
				</section>
			</div>
		</section>
	)
}