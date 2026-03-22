/**
 * DEPRECATED: This file only exists to satisfy outdated tests that mock it.
 * Do not import or use this file in application code.
 * The @supabase/supabase-js dependency has been removed.
 */
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null })
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        order: async () => ({ data: [], error: null }),
        single: async () => ({ data: null, error: null })
      })
    })
  })
} as any;
