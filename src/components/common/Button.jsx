export function Button({ children, variant = "primary", size = "md", icon: Icon, className = "", ...props }) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`} {...props}>
      {Icon ? <Icon size={18} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
