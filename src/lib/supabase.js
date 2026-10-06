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