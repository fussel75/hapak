import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";

export default function LoginPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        await register({ username, password, fullName, role: "chef" });
        toast({ title: "Willkommen!", description: "Konto erfolgreich erstellt." });
      } else {
        await login(username, password);
        toast({ title: "Angemeldet", description: "Willkommen zurück!" });
      }
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Anmeldung fehlgeschlagen", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-login-title">
            FriStD-Bau ZuB
          </CardTitle>
          <CardDescription>
            {isRegister ? "Neues Konto erstellen" : "Anmelden um fortzufahren"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Vollständiger Name</Label>
                <Input
                  id="fullName"
                  data-testid="input-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ronny Friedrich"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Benutzername</Label>
              <Input
                id="username"
                data-testid="input-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="benutzername"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-submit-login"
            >
              {loading ? "Wird geladen..." : isRegister ? "Registrieren" : "Anmelden"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsRegister(!isRegister)}
              data-testid="button-toggle-register"
            >
              {isRegister ? "Bereits ein Konto? Anmelden" : "Noch kein Konto? Registrieren"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
