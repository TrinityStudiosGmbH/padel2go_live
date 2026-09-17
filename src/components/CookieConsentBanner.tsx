import { useState, useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const CONSENT_KEY = "p2g_cookie_consent";

const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if consent has not been given yet
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card px-4 pt-4 pb-safe shadow-2xl md:px-6 md:pt-6">
      <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Cookie className="w-5 h-5 text-primary shrink-0 mt-0.5 sm:mt-0" />
        <p className="text-sm text-muted-foreground flex-1">
          Wir verwenden technisch notwendige Cookies, um den sicheren Betrieb dieser Website zu gewährleisten. Es werden keine Tracking- oder Werbe-Cookies eingesetzt.{" "}
          <NavLink to="/datenschutz" className="text-primary underline hover:no-underline">
            Mehr erfahren
          </NavLink>
        </p>
        <Button
          variant="lime"
          size="sm"
          onClick={handleAccept}
          className="shrink-0 w-full sm:w-auto"
        >
          Verstanden
        </Button>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
