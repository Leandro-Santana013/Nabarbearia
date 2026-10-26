import type { AuthResponse } from "@/services/api"

export interface LoginScreenProps {
  staffOnly?: boolean
  initialMode?: "login" | "register"
  initialError?: string
  onAuthenticated?: (session: AuthResponse) => void
  onGuest?: () => void
  onGoogleSignIn?: () => Promise<AuthResponse>
}
