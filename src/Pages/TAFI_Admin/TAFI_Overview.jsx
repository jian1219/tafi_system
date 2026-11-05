import { CalendarDays, CircleDollarSign, Package, Receipt, Users } from 'lucide-react'

const overviewCards = [
	{
		id: 'employee-records',
		title: 'Employee records',
		category: 'Employee Management',
		icon: Users,
		summary: 'Employee details and branch assignments support attendance, leave, and payroll workflows.',
		important: 'Keep employee status and branch information current.'
	},
	{
		id: 'attendance-leave',
		title: 'Attendance and leave',
		category: 'Employee Management',
		icon: CalendarDays,
		summary: 'Attendance activity and leave requests help teams monitor staffing and time records.',
		important: 'Review entries and requests regularly, especially before payroll.'
	},
	{
		id: 'payroll-finance',
		title: 'Payroll and finance',
		category: 'Payroll & Finance',
		icon: CircleDollarSign,
		summary: 'Branch payroll brings together contributions, additions, deductions, and cash advances.',
		important: 'Check supporting payroll records before finalizing a pay period.'
	},
	{
		id: 'inventory-stock',
		title: 'Inventory and stock',
		category: 'Inventory',
		icon: Package,
		summary: 'TAFI and branch stock records track requests, receipts, and daily usage.',
		important: 'Confirm deliveries and receipts so branch inventory stays aligned.'
	},
	{
		id: 'expense-cdj',
		title: 'Cash Disbursement Journals',
		category: 'Expense',
		icon: Receipt,
		summary: 'Branch CDJ and TAFI CDJ record and organize disbursement activity.',
		important: 'Verify account titles and payment amounts when recording or reviewing entries.'
	}
]

export default function TafiOverview({ adminName }) {
	return (
		<div className="tafi-overview">
			<section className="tafi-overview-intro">
				<p className="eyebrow">Important to know</p>
				<h2>Welcome to TAFI Admin, {adminName || 'Admin'}!</h2>
				<p>
					Here are a few important reminders for the main areas of your dashboard.
				</p>
			</section>

			<blockquote className="tafi-overview-verse">
				<p>“Commit thy works unto the LORD, and thy thoughts shall be established.”</p>
				<cite>Proverbs 16:3 (KJV)</cite>
			</blockquote>

			<div className="tafi-overview-grid">
				{overviewCards.map(({ id, title, category, icon: Icon, summary, important }) => (
					<article className="tafi-overview-card" key={id}>
						<div className="tafi-overview-card-category">
							<Icon size={18} aria-hidden="true" />
							<span>{category}</span>
						</div>
						<h3>{title}</h3>
						<p>{summary}</p>
						<div className="tafi-overview-important">
							<strong>Important</strong>
							<p>{important}</p>
						</div>
					</article>
				))}
			</div>
		</div>
	)
}