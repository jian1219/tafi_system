export const branchEmployees = [
  { id: 'EMP-001', name: 'Arban Ella Marie Layao', position: 'Cashier', todayStatus: 'Present' },
  { id: 'EMP-002', name: 'Guinombay Reynard Coguit', position: 'Sales Associate', todayStatus: 'Present (Late)' },
  { id: 'EMP-003', name: 'Mandang Susan Madrid', position: 'Inventory Clerk', todayStatus: 'Present' },
  { id: 'EMP-004', name: 'Orbita Erlyn Torres', position: 'Customer Service', todayStatus: 'Absent' },
  { id: 'EMP-005', name: 'Osigan Regie Alabat', position: 'Warehouse Staff', todayStatus: 'Present' },
  { id: 'EMP-006', name: 'Polison James Darrel Boiser', position: 'Supervisor', todayStatus: 'Present (Late)' },
  { id: 'EMP-007', name: 'Sabate Anthony Campilan', position: 'Utility Staff', todayStatus: 'Present' },
  { id: 'EMP-008', name: 'Sabanal John Paul', position: 'Delivery Staff', todayStatus: 'Absent' },
  { id: 'EMP-009', name: 'Satorre Kate Francis', position: 'Accounts Staff', todayStatus: 'Present' },
  { id: 'EMP-010', name: 'Singgolan Reymart Lahindao', position: 'Stock Associate', todayStatus: 'Present' }
]

const rosterStorageKey = 'tafi-branch-employees'

export function getBranchEmployees() {
  try {
    const savedRoster = window.localStorage.getItem(rosterStorageKey)
    if (!savedRoster) return branchEmployees

    const parsedRoster = JSON.parse(savedRoster)
    return Array.isArray(parsedRoster) ? parsedRoster : branchEmployees
  } catch {
    return branchEmployees
  }
}

export function saveBranchEmployees(employees) {
  try {
    window.localStorage.setItem(rosterStorageKey, JSON.stringify(employees))
    return true
  } catch {
    return false
  }
}