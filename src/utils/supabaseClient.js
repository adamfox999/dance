import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey =
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
	|| import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
	|| import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && publishableKey)

export const supabase = hasSupabaseConfig
	? createClient(supabaseUrl, publishableKey, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true,
			storageKey: 'dance-tracker-auth',
			storage: typeof window !== 'undefined' ? window.localStorage : undefined,
		},
	})
	: null
