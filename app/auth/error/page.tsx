export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Authentication Error</h1>
        <p className="mt-2 text-muted-foreground">
          There was an error during authentication. Please try again.
        </p>
      </div>
    </div>
  )
}
