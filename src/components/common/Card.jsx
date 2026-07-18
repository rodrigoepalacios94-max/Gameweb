export function Card({ children, className = "", as: Component = "section" }) {
  return <Component className={`card ${className}`}>{children}</Component>;
}
