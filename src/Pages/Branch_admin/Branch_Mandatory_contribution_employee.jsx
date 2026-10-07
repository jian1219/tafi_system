import { useEffect, useState } from 'react'
import { listBranchEmployeeContributions, saveBranchEmployeeContribution } from '../../lib/supabase'
import { getBranchEmployees } from './branchEmployees'

const contributionFields = [
  { key: 'sss', label: 'SSS' },
  { key: 'philhealth', label: 'PhilHealth' },
  { key: 'pagibig', label: 'Pag-IBIG' }
]

const emptyContribution = () => ({ sss: '0.00', philhealth: '0.00', pagibig: '0.00' })

export default function BranchMandatoryContributionEmployee({ branchName = 'Bansasi Branch', branchAdmin }) {
  const [employees, setEmployees] = useState([])
  const [contributions, setContributions] = useState({})
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedEmployeeId, setSavedEmployeeId] = useState('')
  const [savingEmployeeId, setSavingEmployeeId] = useState('')
  const sessionToken = branchAdmin?.session_token

  useEffect(() => {
    let isCurrent = true

    const loadContributions = async () => {
      if (!sessionToken) {
        setLoadError('Your login session does not include contribution access. Apply the Supabase SQL, then sign out and sign in again.')
        setLoadStatus('error')
        return
      }

      const [{ employees: loadedEmployees, error: employeeError }, { data, error }] = await Promise.all([
        getBranchEmployees(sessionToken),
        listBranchEmployeeContributions(sessionToken)
      ])
      if (!isCurrent) return

      if (employeeError) {
        setLoadError(employeeError.message)
        setLoadStatus('error')
        return
      }

      if (error) {
        setLoadError(error.message)
        setLoadStatus('error')
        return
      }

      setEmployees(loadedEmployees)
      const savedByEmployee = Object.fromEntries(
        (data ?? []).map((record) => [
          record.employee_code,
          {
            sss: String(record.sss),
            philhealth: String(record.philhealth),
            pagibig: String(record.pagibig)
          }
        ])
      )
      setContributions(savedByEmployee)
      setLoadError('')
      setLoadStatus('ready')
    }

    loadContributions()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const updateContribution = (employeeCode, field, value) => {
    setContributions((current) => ({
      ...current,
      [employeeCode]: {
        ...(current[employeeCode] ?? emptyContribution()),
        [field]: value
      }
    }))
    setSavedEmployeeId('')
    setSaveError('')
  }

  const saveContribution = async (event, employee) => {
    event.preventDefault()
    const values = contributions[employee.id] ?? emptyContribution()
    const amounts = Object.fromEntries(contributionFields.map(({ key }) => [key, Number(values[key])]))

    if (contributionFields.some(({ key }) =>
      values[key].trim() === '' || !Number.isFinite(amounts[key]) || amounts[key] < 0
    )) {
      setSaveError(`Enter valid non-negative weekly amounts for ${employee.name}.`)
      return
    }

    setSavingEmployeeId(employee.id)
    setSavedEmployeeId('')
    setSaveError('')
    const { error } = await saveBranchEmployeeContribution(sessionToken, {
      employeeCode: employee.id,
      ...amounts
    })
    setSavingEmployeeId('')

    if (error) {
      setSaveError(`Could not save ${employee.name}: ${error.message}`)
      return
    }

    setSavedEmployeeId(employee.id)
  }

  return (
    <section className="employee-info-shell contribution-shell">
      <header className="employee-info-header">
        <div>
          <p className="employee-info-eyebrow">{branchName}</p>
          <h3>Mandatory Contribution Employee</h3>
          <p className="employee-info-description">
            Enter each employee’s weekly SSS, PhilHealth, and Pag-IBIG deductions. These amounts are subtracted from weekly gross pay.
          </p>
        </div>
        <div className="employee-total">
          <strong>{employees.length}</strong>
          <span>Employees</span>
        </div>
      </header>

      {loadStatus === 'loading' && <p className="contribution-message" role="status">Loading saved contributions…</p>}
      {loadStatus === 'error' && <p className="contribution-message error" role="alert">{loadError}</p>}
      {saveError && <p className="contribution-message error" role="alert">{saveError}</p>}

      <div className="employee-table-wrap contribution-table-wrap" role="region" aria-label="Employee contribution list" tabIndex="0">
        <table className="employee-info-table contribution-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Employee ID</th>
              {contributionFields.map(({ key, label }) => <th key={key}>{label} / week (PHP)</th>)}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const values = contributions[employee.id] ?? emptyContribution()
              const isSaving = savingEmployeeId === employee.id

              return (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>{employee.id}</td>
                  {contributionFields.map(({ key, label }) => (
                    <td key={key}>
                      <input
                        className="contribution-amount-input"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={values[key]}
                        disabled={Boolean(savingEmployeeId)}
                        onChange={(event) => updateContribution(employee.id, key, event.target.value)}
                        aria-label={`${label} weekly contribution for ${employee.name}`}
                      />
                    </td>
                  ))}
                  <td>
                    <form onSubmit={(event) => saveContribution(event, employee)}>
                      <button
                        type="submit"
                        className="add-employee-submit contribution-save-button"
                        disabled={loadStatus !== 'ready' || isSaving || Boolean(savingEmployeeId)}
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      {savedEmployeeId === employee.id && <span className="contribution-saved">Saved</span>}
                    </form>
                  </td>
                </tr>
              )
            })}
            {employees.length === 0 && (
              <tr><td className="employee-empty-state" colSpan="6">No branch employees have been added.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}