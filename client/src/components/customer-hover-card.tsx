import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@shared/schema";
import { contactTypeLabels } from "@shared/schema";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MapPin, AlertTriangle } from "lucide-react";

const contactTypeBadgeColors: Record<string, string> = {
  kunde: "bg-blue-100 text-blue-800",
  interessent: "bg-amber-100 text-amber-800",
  lieferant: "bg-green-100 text-green-800",
  personal: "bg-purple-100 text-purple-800",
  sonstige: "bg-gray-100 text-gray-800",
};

export function CustomerHoverCard({
  customerId,
  children,
}: {
  customerId: number;
  children: React.ReactNode;
}) {
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customer = customers?.find((c) => c.id === customerId);

  if (!customer) return <>{children}</>;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="top" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold truncate pr-2" data-testid="hover-customer-name">{customer.name}</p>
            <Badge className={`text-[9px] px-1.5 flex-shrink-0 ${contactTypeBadgeColors[customer.contactType] || ""}`}>
              {contactTypeLabels[customer.contactType] || customer.contactType}
            </Badge>
          </div>
          {customer.name2 && <p className="text-xs text-muted-foreground">{customer.name2}</p>}
          <div className="space-y-1 text-xs text-muted-foreground">
            {(customer.street || customer.city) && (
              <div className="flex items-start gap-1.5">
                <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{customer.street}{customer.street && customer.city ? ", " : ""}{customer.zip} {customer.city}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{customer.email}</span>
              </div>
            )}
          </div>
          {customer.alertText && (
            <div className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded p-1.5 text-[10px] text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{customer.alertText}</span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground font-mono">Nr. {customer.customerNumber}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
