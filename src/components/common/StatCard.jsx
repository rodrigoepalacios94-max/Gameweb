import { Card } from "./Card";

export function StatCard({ label, value, description, icon: Icon, tone = "green" }) {
  return (
    <Card className={`stat-card stat-card--${tone}`}>
      {Icon ? (
        <div className="stat-card__icon">
          <Icon size={30} />
        </div>
      ) : null}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {description ? <small>{description}</small> : null}
      </div>
    </Card>
  );
}
