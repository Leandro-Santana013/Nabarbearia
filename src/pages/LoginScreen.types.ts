import type { AuthResponse } from "@/services/api"

export interface LoginScreenProps {
  initialMode?: "login" | "register"
  initialError?: string
  onAuthenticated?: (session: AuthResponse) => void
  onGuest?: () => void
  onGoogleSignIn?: () => Promise<AuthResponse>
}
