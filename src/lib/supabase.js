const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
let supabaseClientPromise

export async function getSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase is not configured. Check the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY settings.')
  }

  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(supabaseUrl, supabasePublishableKey))
      .catch((error) => {
        supabaseClientPromise = null
        throw error
      })
  }

  return supabaseClientPromise
}

export async function signInWithEmailPassword(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.auth.signInWithPassword({ email: email.trim(), password })
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error('Unable to connect to Supabase. Check your network and try again.')
    }
  }
}

export async function verifySuperAdminCredentials(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    const { data, error } = await supabaseClient.rpc('super_admin_login', {
      p_email: email.trim(),
      p_password: password
    })

    return { profile: data?.[0] ?? null, error }
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error : new Error('Unable to connect to the Super Admin login service.')
    }
  }
}

export async function listSuperAdminBranches(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_list_branches', {
      p_super_admin_email: email.trim(),
      p_super_admin_password: password
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branches.')
    }
  }
}

export async function createBranchWithAdmin({
  superAdminEmail,
  superAdminPassword,
  branchName,
  branchLocation,
  adminName,
  adminEmail,
  adminPassword
}) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_create_branch', {
      p_super_admin_email: superAdminEmail.trim(),
      p_super_admin_password: superAdminPassword,
      p_branch_name: branchName,
      p_branch_location: branchLocation,
      p_admin_name: adminName,
      p_admin_email: adminEmail,
      p_admin_password: adminPassword
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to create the branch.')
    }
  }
}

export async function verifyBranchAdminCredentials(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    const { data, error } = await supabaseClient.rpc('branch_admin_login', {
      p_email: email.trim(),
      p_password: password
    })

    return { profile: data?.[0] ?? null, error }
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error : new Error('Unable to connect to the Branch Admin login service.')
    }
  }
}

export async function listBranchEmployeeContributions(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_employee_contributions', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee contributions.')
    }
  }
}

export async function saveBranchEmployeeContribution(sessionToken, contribution) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_employee_contribution', {
      p_session_token: sessionToken,
      p_employee_code: contribution.employeeCode,
      p_sss: contribution.sss,
      p_philhealth: contribution.philhealth,
      p_pagibig: contribution.pagibig
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save employee contributions.')
    }
  }
}

export async function createBranchCashAdvance(sessionToken, cashAdvance) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_cash_advance', {
      p_session_token: sessionToken,
      p_employee_code: cashAdvance.employeeCode,
      p_period_start: cashAdvance.periodStart,
      p_period_end: cashAdvance.periodEnd,
      p_advance_amount: cashAdvance.advanceAmount,
      p_weekly_deduction: cashAdvance.weeklyDeduction
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the cash advance.')
    }
  }
}

export async function listBranchCashAdvances(sessionToken, periodStart = null, periodEnd = null) {
  try {
    const supabaseClient = await getSupabaseClient()
    const advances = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_cash_advances', {
        p_session_token: sessionToken,
        p_offset: offset,
        p_limit: pageSize,
        p_period_start: periodStart,
        p_period_end: periodEnd
      })
      if (error) return { data: null, error }

      const page = data ?? []
      advances.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return { data: advances, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load cash advance records.')
    }
  }
}

export async function revokeBranchAdminSession(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_logout', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to end the Branch Admin session.')
    }
  }
}

export async function listBranchEmployees(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_employees', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branch employees.')
    }
  }
}

export async function createBranchEmployee(sessionToken, employee) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_employee', {
      p_session_token: sessionToken,
      p_name: employee.name,
      p_position: employee.position
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to add the employee.')
    }
  }
}

export async function updateBranchEmployeeDailyRate(sessionToken, employeeCode, dailyRate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_update_employee_daily_rate', {
      p_session_token: sessionToken,
      p_employee_code: employeeCode,
      p_daily_rate: dailyRate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the employee daily rate.')
    }
  }
}

export async function updateBranchEmployeeProfile(sessionToken, employeeCode, profile) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_update_employee_profile', {
      p_session_token: sessionToken,
      p_employee_code: employeeCode,
      p_address: profile.address,
      p_gender: profile.gender || null,
      p_birthday: profile.birthday || null,
      p_sss_number: profile.sssNumber,
      p_pagibig_number: profile.pagibigNumber,
      p_philhealth_number: profile.philhealthNumber,
      p_employment_classification: profile.employmentClassification
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the employee profile.')
    }
  }
}

export async function createBranchCashAdvanceLoan(sessionToken, cashAdvance) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_cash_advance_loan', {
      p_session_token: sessionToken,
      p_employee_code: cashAdvance.employeeCode,
      p_advance_date: cashAdvance.advanceDate,
      p_advance_amount: cashAdvance.advanceAmount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the cash advance.')
    }
  }
}

export async function listBranchCashAdvanceLoans(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    const advances = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_cash_advance_loans', {
        p_session_token: sessionToken,
        p_offset: offset,
        p_limit: pageSize
      })
      if (error) return { data: null, error }

      const page = data ?? []
      advances.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return { data: advances, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load cash advance records.')
    }
  }
}

export async function listBranchCashAdvancePayments(sessionToken, periodStart = null, periodEnd = null) {
  try {
    const supabaseClient = await getSupabaseClient()
    const payments = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_cash_advance_payments', {
        p_session_token: sessionToken,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_offset: offset,
        p_limit: pageSize
      })
      if (error) return { data: null, error }

      const page = data ?? []
      payments.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return { data: payments, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load cash advance repayments.')
    }
  }
}

export async function saveBranchCashAdvanceWeeklyDeductions(sessionToken, advanceId, payments) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_cash_advance_weekly_deductions', {
      p_session_token: sessionToken,
      p_advance_id: advanceId,
      p_payments: payments.map((payment) => ({
        period_start: payment.periodStart,
        period_end: payment.periodEnd,
        amount: payment.amount
      }))
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save weekly cash advance deductions.')
    }
  }
}

export async function createBranchHdmfLoan(sessionToken, loan) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_hdmf_loan', {
      p_session_token: sessionToken,
      p_employee_code: loan.employeeCode,
      p_loan_amount: loan.loanAmount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the HDMF loan.')
    }
  }
}

export async function listBranchHdmfLoans(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_hdmf_loans', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load HDMF loans.')
    }
  }
}

export async function createBranchHdmfPayment(sessionToken, payment) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_hdmf_payment', {
      p_session_token: sessionToken,
      p_loan_id: payment.loanId,
      p_period_start: payment.periodStart,
      p_period_end: payment.periodEnd,
      p_amount: payment.amount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the HDMF repayment.')
    }
  }
}

export async function listBranchHdmfPayments(sessionToken, periodStart = null, periodEnd = null) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_hdmf_payments', {
      p_session_token: sessionToken,
      p_period_start: periodStart,
      p_period_end: periodEnd
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load HDMF repayment records.')
    }
  }
}

export async function listBranchUndertimeDeductions(sessionToken, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    const deductions = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_undertime_deductions', {
        p_session_token: sessionToken,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_offset: offset,
        p_limit: pageSize
      })
      if (error) return { data: null, error }

      const page = data ?? []
      deductions.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return { data: deductions, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load undertime deductions.')
    }
  }
}

export async function saveBranchUndertimeDeduction(sessionToken, deduction) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_undertime_deduction', {
      p_session_token: sessionToken,
      p_employee_code: deduction.employeeCode,
      p_period_start: deduction.periodStart,
      p_period_end: deduction.periodEnd,
      p_amount: deduction.amount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the undertime deduction.')
    }
  }
}

export async function listBranchPayrollAdditions(sessionToken, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    const additions = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_payroll_additions', {
        p_session_token: sessionToken,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_offset: offset,
        p_limit: pageSize
      })
      if (error) return { data: null, error }

      const page = data ?? []
      additions.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return { data: additions, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load payroll additions.')
    }
  }
}

export async function saveBranchPayrollAddition(sessionToken, addition) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_payroll_addition', {
      p_session_token: sessionToken,
      p_employee_code: addition.employeeCode,
      p_period_start: addition.periodStart,
      p_period_end: addition.periodEnd,
      p_addition_type: addition.additionType,
      p_amount: addition.amount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the payroll addition.')
    }
  }
}

export async function listBranchAttendance(sessionToken, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_attendance', {
      p_session_token: sessionToken,
      p_start_date: startDate,
      p_end_date: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load attendance records.')
    }
  }
}

export async function listBranchAttendanceHistory(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    const history = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_attendance_history', {
        p_session_token: sessionToken,
        p_offset: offset,
        p_limit: pageSize
      })
      if (error) return { data: null, error }

      const page = data ?? []
      history.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return { data: history, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load attendance history.')
    }
  }
}

export async function saveBranchWeeklyPayrollSnapshot(sessionToken, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_weekly_payroll_snapshot', {
      p_session_token: sessionToken,
      p_period_start: periodStart,
      p_period_end: periodEnd
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the weekly payroll snapshot.')
    }
  }
}

export async function listBranchWeeklyPayrollSnapshots(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    const snapshots = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_weekly_payroll_snapshots', {
        p_session_token: sessionToken,
        p_offset: offset,
        p_limit: pageSize
      })
      if (error) return { data: null, error }

      const page = data ?? []
      snapshots.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return { data: snapshots, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load saved payroll history.')
    }
  }
}

export async function saveBranchAttendance(sessionToken, attendanceDate, records) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_attendance', {
      p_session_token: sessionToken,
      p_attendance_date: attendanceDate,
      p_records: records
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save attendance.')
    }
  }
}