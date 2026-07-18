export function Card({ children, className = "", as: Component = "section", ...props }) {
  return <Component className={`card ${className}`} {...props}>{children}</Component>;
}
