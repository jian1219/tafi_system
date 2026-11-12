import { BookOpen, Package, Quote, Receipt, Users, Wallet } from 'lucide-react'

const overviewCards = [
  {
    id: 'employees',
    title: 'Employees and attendance',
    category: 'Employee Management',
    icon: Users,
    summary: 'Manage employee records, attendance, and leave credits.',
    accent: 'employees'
  },
  {
    id: 'payroll',
    title: 'Payroll and finance',
    category: 'Payroll & Finance',
    icon: Wallet,
    summary: 'Review payroll, cash advances, additions, and deductions.',
    accent: 'payroll'
  },
  {
    id: 'sales',
    title: 'Sales',
    category: 'Sales',
    icon: Receipt,
    summary: 'Open sales journals, deposits, transactions, discounts, and summaries.',
    accent: 'sales'
  },
  {
    id: 'expenses',
    title: 'Expenses',
    category: 'Expense',
    icon: Receipt,
    summary: 'Record cash disbursements and review daily and monthly summaries.',
    accent: 'expenses'
  },
  {
    id: 'inventory',
    title: 'Inventory and stock',
    category: 'Inventory',
    icon: Package,
    summary: 'Track branch stock, confirm receipts, and follow stock requests.',
    accent: 'inventory'
  }
]

export default function BranchOverview({ branchName, branchAdmin }) {
  return (
    <div className="branch-overview-layout">
      <section className="branch-overview-verse-panel">
        <div className="branch-overview-brand">
          <span className="branch-overview-brand-icon">
            <BookOpen size={19} aria-hidden="true" />
          </span>
          <span>{branchName || 'Branch'} workspace</span>
        </div>
        <div className="branch-overview-verse-content">
          <p className="branch-overview-welcome">Welcome back</p>
          <h2>{branchAdmin?.admin_name || 'Branch Admin'}</h2>
          <blockquote className="tafi-overview-verse branch-overview-scripture">
            <Quote className="branch-overview-quote-icon" size={30} aria-hidden="true" />
            <p>“Commit thy works unto the LORD, and thy thoughts shall be established.”</p>
            <cite>Proverbs 16:3 <span>·</span> KJV</cite>
          </blockquote>
        </div>
        <div className="branch-overview-verse-footer">
          <span className="branch-overview-status-dot" aria-hidden="true" />
          <span>Serving your branch, one day at a time</span>
        </div>
      </section>

      <section className="branch-overview-workspace" aria-labelledby="branch-overview-heading">
        <header className="branch-overview-heading">
          <div>
            <p className="branch-overview-heading-label">Your dashboard</p>
            <h2 id="branch-overview-heading">Branch workspace</h2>
          </div>
          <span className="branch-overview-count">05 sections</span>
        </header>
        <div className="branch-overview-cards">
          {overviewCards.map(({ id, title, category, icon: Icon, summary, accent }, index) => (
            <article className={`branch-overview-card branch-overview-card-${accent}`} key={id}>
              <span className="branch-overview-card-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div className="branch-overview-card-copy">
                <p>{category}</p>
                <h3>{title}</h3>
                <span>{summary}</span>
              </div>
              <span className="branch-overview-card-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}