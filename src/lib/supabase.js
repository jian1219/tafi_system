const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
let supabaseClientPromise
const roleSessionDurationMs = 12 * 60 * 60 * 1000

function addRoleSessionExpiry(profile) {
  return profile
    ? { ...profile, session_expires_at: new Date(Date.now() + roleSessionDurationMs).toISOString() }
    : null
}

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

export async function verifyTafiAdminCredentials(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    const { data, error } = await supabaseClient.rpc('tafi_admin_login', {
      p_email: email.trim(),
      p_password: password
    })

    return { profile: addRoleSessionExpiry(data?.[0] ?? null), error }
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error : new Error('Unable to connect to the TAFI Admin login service.')
    }
  }
}

export async function listTafiAdminBranches(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_branches', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branches.')
    }
  }
}

export async function listTafiAdminBranchInventoryUsageHistory(sessionToken, branchId, usageDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_branch_inventory_usage_history', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_usage_date: usageDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branch inventory usage history.')
    }
  }
}

export async function listTafiAdminBranchInventoryMonthlyUsage(sessionToken, branchId, monthStart) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_branch_inventory_monthly_usage', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_month_start: monthStart
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branch monthly inventory usage.')
    }
  }
}

export async function listTafiAdminInventoryInformation(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_inventory_information', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load inventory information.')
    }
  }
}

export async function createTafiAdminInventoryInformation(sessionToken, item) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_create_inventory_information', {
      p_session_token: sessionToken,
      p_stock_no: item.stockNo,
      p_category: item.category,
      p_item_description: item.itemDescription,
      p_unit_of_measure: item.unitOfMeasure,
      p_supplier: item.supplier
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the inventory item.')
    }
  }
}

export async function listTafiAdminStockInventory(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_stock_inventory', {
    	p_session_token: sessionToken
    })
  } catch (error) {
    return {
    	data: null,
    	error: error instanceof Error ? error : new Error('Unable to load stock inventory.')
    }
  }
}

export async function listTafiAdminBranchInventory(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_branch_inventory', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branch inventory stock.')
    }
  }
}

export async function createTafiAdminStockInventory(sessionToken, inventoryId, onhand) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_create_stock_inventory', {
    	p_session_token: sessionToken,
    	p_inventory_id: inventoryId,
    	p_onhand: onhand
    })
  } catch (error) {
    return {
    	data: null,
    	error: error instanceof Error ? error : new Error('Unable to add the stock item.')
    }
  }
}

export async function listTafiAdminStockInventoryArrivals(sessionToken) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('tafi_admin_list_stock_inventory_arrivals', {
  		p_session_token: sessionToken
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to load stock arrivals.')
  	}
  }
}

export async function createTafiAdminStockInventoryArrival(sessionToken, stockInventoryId, qty) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('tafi_admin_create_stock_inventory_arrival', {
  		p_session_token: sessionToken,
  		p_stock_inventory_id: stockInventoryId,
  		p_qty: qty
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to record the stock arrival.')
  	}
  }
}

export async function listTafiAdminStockRequests(sessionToken) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('tafi_admin_list_stock_requests', {
  		p_session_token: sessionToken
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to load stock requests.')
  	}
  }
}

export async function deliverTafiAdminStockRequest(sessionToken, requestId, quantityDelivered) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('tafi_admin_deliver_stock_request', {
  		p_session_token: sessionToken,
  		p_request_id: requestId,
  		p_quantity_delivered: quantityDelivered
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to mark the stock request as delivered.')
  	}
  }
}

export async function listTafiAdminEmployeeContributions(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_employee_contributions', {
      p_session_token: sessionToken,
      p_branch_id: branchId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee contributions.')
    }
  }
}

export async function saveTafiAdminEmployeeContribution(sessionToken, branchId, contribution) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_employee_contribution', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function getTafiAdminContributionPeriodSettings(sessionToken, monthStart) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_get_contribution_period_settings', {
      p_session_token: sessionToken,
      p_month_start: monthStart
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load contribution period settings.')
    }
  }
}

export async function saveTafiAdminContributionPeriodSettings(
  sessionToken,
  monthStart,
  enabledPeriodStarts
) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_contribution_period_settings', {
      p_session_token: sessionToken,
      p_month_start: monthStart,
      p_enabled_period_starts: enabledPeriodStarts
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save contribution period settings.')
    }
  }
}

export async function getTafiAdminWeeklyPayrollData(sessionToken, branchId, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_get_weekly_payroll_data', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: periodStart,
      p_period_end: periodEnd
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load weekly payroll data.')
    }
  }
}

export async function listTafiAdminEmployees(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_employees', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employees.')
    }
  }
}

export async function listTafiAdminEmployeeRankings(sessionToken, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_employee_rankings', {
      p_session_token: sessionToken,
      p_start_date: startDate,
      p_end_date: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee rankings.')
    }
  }
}

export async function listTafiAdminAttendance(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_attendance', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function listTafiAdminAttendanceSubmissionHistory(sessionToken, offset = 0, limit = 100) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_attendance_submission_history', {
      p_session_token: sessionToken,
      p_offset: offset,
      p_limit: limit
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load attendance submission history.')
    }
  }
}

export async function listTafiAdminAttendancePeriodControls(sessionToken, branchId, periodStarts) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_attendance_period_controls', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_starts: periodStarts
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load attendance period controls.')
    }
  }
}

export async function setTafiAdminAttendancePeriodLock(
  sessionToken,
  branchId,
  periodStart,
  periodEnd,
  isLocked
) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_set_attendance_period_lock', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_is_locked: isLocked
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to update the attendance period lock.')
    }
  }
}

export async function getTafiAdminAttendancePeriodAccessMode(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_get_attendance_period_access_mode', {
      p_session_token: sessionToken,
      p_branch_id: branchId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load the attendance access mode.')
    }
  }
}

export async function setTafiAdminAttendancePeriodAccessMode(sessionToken, branchId, accessMode) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_set_attendance_period_access_mode', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_access_mode: accessMode
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the attendance access mode.')
    }
  }
}

export async function listTafiAdminOvertimeHours(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_overtime_hours', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: startDate,
      p_period_end: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load overtime hours.')
    }
  }
}

export async function listTafiAdminPayrollAdditions(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    const additions = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('tafi_admin_list_other_additions', {
        p_session_token: sessionToken,
        p_branch_id: branchId,
        p_period_start: startDate,
        p_period_end: endDate,
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

export async function saveTafiAdminPayrollAddition(sessionToken, branchId, addition) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_other_addition', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_employee_code: addition.employeeCode,
      p_period_start: addition.periodStart,
      p_period_end: addition.periodEnd,
      p_addition_type: addition.additionType,
      p_amount: addition.amount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save payroll addition.')
    }
  }
}

export async function listTafiAdminOvertimeHistory(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_other_overtime_hours', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: startDate,
      p_period_end: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load overtime hours.')
    }
  }
}

export async function saveTafiAdminOvertimeHours(sessionToken, branchId, overtime) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_other_overtime_hours', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_employee_code: overtime.employeeCode,
      p_period_start: overtime.periodStart,
      p_period_end: overtime.periodEnd,
      p_daily_hours: overtime.dailyHours
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save overtime hours.')
    }
  }
}

export async function listTafiAdminHolidayPay(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_other_holiday_pay', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: startDate,
      p_period_end: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load holiday pay entries.')
    }
  }
}

export async function listTafiAdminHolidayPayRules(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_other_holiday_pay_rules', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: startDate,
      p_period_end: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load holiday pay rules.')
    }
  }
}

export async function saveTafiAdminHolidayPay(sessionToken, branchId, holidayPay) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_other_holiday_pay', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: holidayPay.periodStart,
      p_period_end: holidayPay.periodEnd,
      p_holiday_date: holidayPay.holidayDate,
      p_addition_type: holidayPay.additionType,
      p_percentage: holidayPay.percentage,
      p_eligible_classifications: holidayPay.eligibleClassifications
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save holiday pay.')
    }
  }
}

export async function listTafiAdminUndertimeDeductions(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_undertime_deductions', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: startDate,
      p_period_end: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load undertime deductions.')
    }
  }
}

export async function createTafiAdminHdmfLoan(sessionToken, branchId, loan) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_create_hdmf_loan', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function listTafiAdminHdmfLoans(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_hdmf_loans', {
      p_session_token: sessionToken,
      p_branch_id: branchId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load HDMF loans.')
    }
  }
}

export async function createTafiAdminHdmfPayment(sessionToken, branchId, payment) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_create_hdmf_payment', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function listTafiAdminHdmfPayments(sessionToken, branchId, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_hdmf_payments', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function listTafiAdminUndertimeRecords(sessionToken, branchId, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    const deductions = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('tafi_admin_list_undertime_records', {
        p_session_token: sessionToken,
        p_branch_id: branchId,
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

export async function saveTafiAdminUndertimeMinutes(sessionToken, branchId, undertime) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_undertime_minutes', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_employee_code: undertime.employeeCode,
      p_undertime_date: undertime.undertimeDate,
      p_minutes: undertime.minutes
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save undertime minutes.')
    }
  }
}

export async function listTafiAdminOtherDeductions(sessionToken, branchId, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    const deductions = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('tafi_admin_list_other_deductions', {
        p_session_token: sessionToken,
        p_branch_id: branchId,
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
      error: error instanceof Error ? error : new Error('Unable to load other deductions.')
    }
  }
}

export async function createTafiAdminOtherDeduction(sessionToken, branchId, deduction) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_create_other_deduction', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_employee_code: deduction.employeeCode,
      p_period_start: deduction.periodStart,
      p_period_end: deduction.periodEnd,
      p_description: deduction.description,
      p_amount: deduction.amount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the other deduction.')
    }
  }
}

export async function listTafiAdminEmployeeLeaveCredits(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_employee_leave_credits', {
      p_session_token: sessionToken,
      p_branch_id: branchId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee leave credits.')
    }
  }
}

export async function listTafiAdminEmployeeLeaveCreditSummary(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_employee_leave_credit_summary', {
      p_session_token: sessionToken,
      p_branch_id: branchId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee leave-credit details.')
    }
  }
}

export async function addTafiAdminEmployeeLeaveCredits(sessionToken, branchId, credit) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_add_employee_leave_credits', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_employee_code: credit.employeeCode,
      p_credit_days: credit.creditDays,
      p_reason: credit.reason
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to add employee leave credits.')
    }
  }
}

export async function listTafiAdminEmployeeLeaveRequests(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_employee_leave_requests', {
      p_session_token: sessionToken,
      p_branch_id: branchId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee leave requests.')
    }
  }
}

export async function updateTafiAdminEmployeeLeaveRequestStatus(sessionToken, branchId, requestId, status) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_update_employee_leave_request_status', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_request_id: requestId,
      p_status: status
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to update the employee leave request.')
    }
  }
}

export async function saveTafiAdminAttendance(sessionToken, branchId, attendanceDate, records) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_attendance', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function createTafiAdminEmployee(sessionToken, employee) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_create_employee', {
      p_session_token: sessionToken,
      p_branch_id: employee.branchId,
      p_employee_code: employee.employeeCode,
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

export async function updateTafiAdminEmployeeProfile(sessionToken, employeeId, profile) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_update_employee_profile', {
      p_session_token: sessionToken,
      p_employee_id: employeeId,
      p_address: profile.address,
      p_gender: profile.gender || null,
      p_civil_status: profile.civilStatus || null,
      p_birthday: profile.birthday || null,
      p_email: profile.email || null,
      p_phone: profile.phone || null,
      p_emergency_contact_name: profile.emergencyContactName || null,
      p_emergency_contact_number: profile.emergencyContactNumber || null,
      p_emergency_contact_relationship: profile.emergencyContactRelationship || null,
      p_hire_date: profile.hireDate || null,
      p_probationary_start_date: profile.probationaryDate || null,
      p_regular_start_date: profile.regularDate || null,
      p_tin_number: profile.tinNumber,
      p_sss_number: profile.sssNumber,
      p_pagibig_number: profile.pagibigNumber,
      p_philhealth_number: profile.philhealthNumber,
      p_employment_classification: profile.employmentClassification,
      p_place_of_birth: profile.placeOfBirth?.trim() || null,
      p_employment_status: profile.employmentStatus
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the employee profile.')
    }
  }
}

export async function saveTafiAdminEmployeePhoto(sessionToken, employeeId, contentType, photoBase64) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_employee_photo', {
      p_session_token: sessionToken,
      p_employee_id: employeeId,
      p_content_type: contentType,
      p_photo_base64: photoBase64
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the employee photo.')
    }
  }
}

export async function getTafiAdminEmployeePhoto(sessionToken, employeeId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_get_employee_photo', {
      p_session_token: sessionToken,
      p_employee_id: employeeId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load the employee photo.')
    }
  }
}

export async function listTafiAdminEmployeeDocuments(sessionToken, employeeId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_list_employee_documents', {
      p_session_token: sessionToken,
      p_employee_id: employeeId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee documents.')
    }
  }
}

export async function uploadTafiAdminEmployeeDocument(
  sessionToken,
  employeeId,
  documentType,
  fileName,
  contentType,
  fileBase64
) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_upload_employee_document', {
      p_session_token: sessionToken,
      p_employee_id: employeeId,
      p_document_type: documentType,
      p_file_name: fileName,
      p_content_type: contentType,
      p_file_base64: fileBase64
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to upload the employee document.')
    }
  }
}

export async function getTafiAdminEmployeeDocument(sessionToken, documentId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_get_employee_document', {
      p_session_token: sessionToken,
      p_document_id: documentId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to download the employee document.')
    }
  }
}

export async function deleteTafiAdminEmployeeDocument(sessionToken, documentId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_delete_employee_document', {
      p_session_token: sessionToken,
      p_document_id: documentId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to delete the employee document.')
    }
  }
}

export async function listGuestEmployeeDocuments(sessionToken, employeeId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_employee_documents', {
      p_session_token: sessionToken,
      p_employee_id: employeeId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee records.')
    }
  }
}

export async function getGuestEmployeeDocument(sessionToken, documentId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_get_employee_document', {
      p_session_token: sessionToken,
      p_document_id: documentId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load the employee record.')
    }
  }
}

export async function listGuestEmployeeBranches(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_employee_branches', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branches.')
    }
  }
}

export async function listGuestEmployees(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_employees', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employees.')
    }
  }
}

export async function listGuestEmployeeRankings(sessionToken, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_employee_rankings', {
      p_session_token: sessionToken,
      p_start_date: startDate,
      p_end_date: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee rankings.')
    }
  }
}

export async function getGuestEmployeePhoto(sessionToken, employeeId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_get_employee_photo', {
      p_session_token: sessionToken,
      p_employee_id: employeeId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load the employee photo.')
    }
  }
}

export async function listGuestEmployeeAttendance(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_employee_attendance', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function listGuestOvertimeHours(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_overtime_hours', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: startDate,
      p_period_end: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load overtime hours.')
    }
  }
}

export async function listGuestUndertimeDeductions(sessionToken, branchId, startDate, endDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_undertime_deductions', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_period_start: startDate,
      p_period_end: endDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load undertime deductions.')
    }
  }
}

export async function listGuestEmployeeContributions(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_list_employee_contributions', {
      p_session_token: sessionToken,
      p_branch_id: branchId
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee contributions.')
    }
  }
}

export async function updateTafiAdminEmployeeIdentity(sessionToken, employeeId, identity) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_update_employee_identity', {
      p_session_token: sessionToken,
      p_employee_id: employeeId,
      p_employee_code: identity.employeeCode,
      p_name: identity.name,
      p_position: identity.position
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to update employee information.')
    }
  }
}

export async function updateTafiAdminEmployeeDailyRate(sessionToken, employeeId, dailyRate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_update_employee_daily_rate', {
      p_session_token: sessionToken,
      p_employee_id: employeeId,
      p_daily_rate: dailyRate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the employee daily rate.')
    }
  }
}

export async function revokeTafiAdminSession(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_logout', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error('Unable to end the TAFI Admin session.')
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

export async function listTafiAdmins(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_list_tafi_admins', {
      p_super_admin_email: email.trim(),
      p_super_admin_password: password
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load TAFI Admin accounts.')
    }
  }
}

export async function createTafiAdmin({
  superAdminEmail,
  superAdminPassword,
  adminName,
  adminEmail,
  adminPassword
}) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_create_tafi_admin', {
      p_super_admin_email: superAdminEmail.trim(),
      p_super_admin_password: superAdminPassword,
      p_admin_name: adminName,
      p_admin_email: adminEmail,
      p_admin_password: adminPassword
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to create the TAFI Admin account.')
    }
  }
}

export async function listAccountants(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_list_accountants', {
      p_super_admin_email: email.trim(),
      p_super_admin_password: password
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load Accountant accounts.')
    }
  }
}

export async function createAccountant({
  superAdminEmail,
  superAdminPassword,
  accountantName,
  accountantEmail,
  accountantPassword
}) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_create_accountant', {
      p_super_admin_email: superAdminEmail.trim(),
      p_super_admin_password: superAdminPassword,
      p_accountant_name: accountantName,
      p_accountant_email: accountantEmail,
      p_accountant_password: accountantPassword
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to create the Accountant account.')
    }
  }
}

export async function listGuestAccounts(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_list_guest_accounts', {
      p_super_admin_email: email.trim(),
      p_super_admin_password: password
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load Guest accounts.')
    }
  }
}

export async function createGuestAccount({
  superAdminEmail,
  superAdminPassword,
  guestName,
  guestEmail,
  guestPassword
}) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('super_admin_create_guest_account', {
      p_super_admin_email: superAdminEmail.trim(),
      p_super_admin_password: superAdminPassword,
      p_guest_name: guestName,
      p_guest_email: guestEmail,
      p_guest_password: guestPassword
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to create the Guest account.')
    }
  }
}

export async function verifyAccountantCredentials(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    const { data, error } = await supabaseClient.rpc('accountant_login', {
      p_email: email.trim(),
      p_password: password
    })

    return { profile: addRoleSessionExpiry(data?.[0] ?? null), error }
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error : new Error('Unable to connect to the Accountant login service.')
    }
  }
}

export async function revokeAccountantSession(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_logout', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error('Unable to end the Accountant session.')
    }
  }
}

export async function verifyGuestCredentials(email, password) {
  try {
    const supabaseClient = await getSupabaseClient()
    const { data, error } = await supabaseClient.rpc('guest_login', {
      p_email: email.trim(),
      p_password: password
    })

    return { profile: addRoleSessionExpiry(data?.[0] ?? null), error }
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error : new Error('Unable to connect to the Guest login service.')
    }
  }
}

export async function revokeGuestSession(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('guest_logout', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error('Unable to end the Guest session.')
    }
  }
}

export async function listAccountantInventoryInformation(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_list_inventory_information', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load inventory information.')
    }
  }
}

export async function listAccountantTafiStockInventory(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_list_tafi_stock_inventory', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load TAFI stock.')
    }
  }
}

export async function listAccountantBranchStockInventory(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_list_branch_stock_inventory', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branch stock.')
    }
  }
}

export async function listAccountantInventoryBranches(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_list_inventory_branches', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branches.')
    }
  }
}

export async function listAccountantBranchInventoryUsageHistory(sessionToken, branchId, usageDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_list_branch_inventory_usage_history', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_usage_date: usageDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branch inventory usage history.')
    }
  }
}

export async function listAccountantBranchInventoryMonthlyUsage(sessionToken, branchId, monthStart) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_list_branch_inventory_monthly_usage', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
      p_month_start: monthStart
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load branch monthly inventory usage.')
    }
  }
}

export async function createAccountantInventoryInformation(sessionToken, item) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('accountant_create_inventory_information', {
      p_session_token: sessionToken,
      p_stock_no: item.stockNo,
      p_category: item.category,
      p_item_description: item.itemDescription,
      p_unit_of_measure: item.unitOfMeasure,
      p_supplier: item.supplier
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the inventory item.')
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

    return { profile: addRoleSessionExpiry(data?.[0] ?? null), error }
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error : new Error('Unable to connect to the Branch Admin login service.')
    }
  }
}

export async function listBranchTafiStockItems(sessionToken) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_list_tafi_stock_items', {
  		p_session_token: sessionToken
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to load TAFI stock items.')
  	}
  }
}

export async function listBranchInventory(sessionToken) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_list_inventory', {
  		p_session_token: sessionToken
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to load branch inventory.')
  	}
  }
}

export async function addBranchInventoryItem(sessionToken, stockInventoryId, available) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_add_inventory_item', {
  		p_session_token: sessionToken,
  		p_stock_inventory_id: stockInventoryId,
  		p_available: available
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to add the branch inventory item.')
  	}
  }
}

export async function listBranchAdminInventoryDailyLog(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_inventory_daily_log', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load the daily inventory log.')
    }
  }
}

export async function listBranchAdminInventoryUsageDates(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_inventory_usage_dates', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load inventory usage history dates.')
    }
  }
}

export async function listBranchAdminInventoryUsageHistory(sessionToken, usageDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_inventory_usage_history', {
      p_session_token: sessionToken,
      p_usage_date: usageDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load inventory usage history.')
    }
  }
}

export async function listBranchAdminInventoryMonthlyUsage(sessionToken, monthStart) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_inventory_monthly_usage', {
      p_session_token: sessionToken,
      p_month_start: monthStart
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load monthly inventory usage.')
    }
  }
}

export async function recordBranchAdminInventoryDailyUsage(sessionToken, branchInventoryId, usageQuantity) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_record_inventory_daily_usage', {
      p_session_token: sessionToken,
      p_branch_inventory_id: branchInventoryId,
      p_usage_quantity: usageQuantity
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save daily inventory usage.')
    }
  }
}

export async function listBranchStockRequests(sessionToken) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_list_stock_requests', {
  		p_session_token: sessionToken
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to load stock requests.')
  	}
  }
}

export async function createBranchStockRequest(sessionToken, stockInventoryId, quantityRequested) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_create_stock_request', {
  		p_session_token: sessionToken,
  		p_stock_inventory_id: stockInventoryId,
  		p_quantity_requested: quantityRequested
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to submit the stock request.')
  	}
  }
}

export async function createBranchStockRequestBatch(sessionToken, items) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_create_stock_request_batch', {
  		p_session_token: sessionToken,
  		p_items: items.map((item) => ({
  			stock_inventory_id: item.stockInventoryId,
  			quantity_requested: item.quantityRequested
  		}))
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to submit the stock request.')
  	}
  }
}

export async function listBranchStockReceiptHistory(sessionToken) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_list_stock_receipt_history', {
  		p_session_token: sessionToken
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to load stock receipt history.')
  	}
  }
}

export async function receiveBranchStockRequest(sessionToken, requestId, quantityReceived) {
  try {
  	const supabaseClient = await getSupabaseClient()
  	return await supabaseClient.rpc('branch_admin_receive_stock_request', {
  		p_session_token: sessionToken,
  		p_request_id: requestId,
  		p_quantity_received: quantityReceived
  	})
  } catch (error) {
  	return {
  		data: null,
  		error: error instanceof Error ? error : new Error('Unable to receive the stock order.')
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

export async function getBranchAdminContributionPeriodEnabled(sessionToken, periodStart) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_is_contribution_period_enabled', {
      p_session_token: sessionToken,
      p_period_start: periodStart
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load the contribution period setting.')
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

export async function getBranchAdminEmployeePhoto(sessionToken, employeeCode) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_get_employee_photo', {
      p_session_token: sessionToken,
      p_employee_code: employeeCode
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load the employee photo.')
    }
  }
}

export async function listBranchEmployeeLeaveCredits(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_employee_leave_credits', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee leave credits.')
    }
  }
}

export async function listBranchEmployeeLeaveRequests(sessionToken) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_employee_leave_requests', {
      p_session_token: sessionToken
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load employee leave requests.')
    }
  }
}

export async function createBranchEmployeeLeaveRequest(sessionToken, request) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_employee_leave_request', {
      p_session_token: sessionToken,
      p_employee_code: request.employeeCode,
      p_start_date: request.startDate,
      p_end_date: request.endDate,
      p_credit_days: request.creditDays,
      p_reason: request.reason
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to submit the employee leave request.')
    }
  }
}

export async function updateBranchEmployeeLeaveRequestStatus(sessionToken, requestId, status) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_update_employee_leave_request_status', {
      p_session_token: sessionToken,
      p_request_id: requestId,
      p_status: status
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to update the employee leave request.')
    }
  }
}

export async function createBranchEmployee(sessionToken, employee) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_employee', {
      p_session_token: sessionToken,
      p_employee_code: employee.employeeCode,
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

export async function createTafiAdminCashAdvanceLoan(sessionToken, branchId, cashAdvance) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_create_cash_advance_loan', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function listTafiAdminCashAdvanceLoans(sessionToken, branchId) {
  try {
    const supabaseClient = await getSupabaseClient()
    const advances = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('tafi_admin_list_cash_advance_loans', {
        p_session_token: sessionToken,
        p_branch_id: branchId,
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

export async function listTafiAdminCashAdvancePayments(
  sessionToken,
  branchId,
  periodStart = null,
  periodEnd = null
) {
  try {
    const supabaseClient = await getSupabaseClient()
    const payments = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('tafi_admin_list_cash_advance_payments', {
        p_session_token: sessionToken,
        p_branch_id: branchId,
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

export async function saveTafiAdminCashAdvanceWeeklyDeductions(
  sessionToken,
  branchId,
  advanceId,
  payments
) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('tafi_admin_save_cash_advance_weekly_deductions', {
      p_session_token: sessionToken,
      p_branch_id: branchId,
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

export async function saveBranchUndertimeMinutes(sessionToken, undertime) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_undertime_minutes', {
      p_session_token: sessionToken,
      p_employee_code: undertime.employeeCode,
      p_undertime_date: undertime.undertimeDate,
      p_minutes: undertime.minutes
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save undertime minutes.')
    }
  }
}

export async function listBranchOtherDeductions(sessionToken, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    const deductions = []
    const pageSize = 500
    let offset = 0

    while (true) {
      const { data, error } = await supabaseClient.rpc('branch_admin_list_other_deductions', {
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
      error: error instanceof Error ? error : new Error('Unable to load other deductions.')
    }
  }
}

export async function createBranchOtherDeduction(sessionToken, deduction) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_create_other_deduction', {
      p_session_token: sessionToken,
      p_employee_code: deduction.employeeCode,
      p_period_start: deduction.periodStart,
      p_period_end: deduction.periodEnd,
      p_description: deduction.description,
      p_amount: deduction.amount
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save the other deduction.')
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

export async function listBranchOvertimeHours(sessionToken, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_overtime_hours', {
      p_session_token: sessionToken,
      p_period_start: periodStart,
      p_period_end: periodEnd
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load daily overtime hours.')
    }
  }
}

export async function saveBranchOvertimeHours(sessionToken, overtime) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_overtime_hours', {
      p_session_token: sessionToken,
      p_employee_code: overtime.employeeCode,
      p_period_start: overtime.periodStart,
      p_period_end: overtime.periodEnd,
      p_daily_hours: overtime.dailyHours
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save daily overtime hours.')
    }
  }
}

export async function listBranchHolidayPay(sessionToken, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_holiday_pay', {
      p_session_token: sessionToken,
      p_period_start: periodStart,
      p_period_end: periodEnd
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load holiday pay entries.')
    }
  }
}

export async function listBranchHolidayPayRules(sessionToken, periodStart, periodEnd) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_list_holiday_pay_rules', {
      p_session_token: sessionToken,
      p_period_start: periodStart,
      p_period_end: periodEnd
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to load holiday pay rules.')
    }
  }
}

export async function saveBranchHolidayPay(sessionToken, holidayPay) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_save_holiday_pay', {
      p_session_token: sessionToken,
      p_period_start: holidayPay.periodStart,
      p_period_end: holidayPay.periodEnd,
      p_holiday_date: holidayPay.holidayDate,
      p_addition_type: holidayPay.additionType,
      p_percentage: holidayPay.percentage,
      p_eligible_classifications: holidayPay.eligibleClassifications
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to save holiday pay.')
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

export async function getBranchAttendancePeriodControl(sessionToken, attendanceDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    const { data, error } = await supabaseClient.rpc('branch_admin_get_attendance_period_control', {
      p_session_token: sessionToken,
      p_attendance_date: attendanceDate
    })
    return { data: data?.[0] ?? null, error }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to check the attendance period lock.')
    }
  }
}

export async function requestBranchAttendancePeriodUnlock(sessionToken, attendanceDate) {
  try {
    const supabaseClient = await getSupabaseClient()
    return await supabaseClient.rpc('branch_admin_request_attendance_period_unlock', {
      p_session_token: sessionToken,
      p_attendance_date: attendanceDate
    })
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unable to request an attendance period unlock.')
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