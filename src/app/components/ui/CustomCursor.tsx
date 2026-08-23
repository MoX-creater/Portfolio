import { useEffect, useState } from "react";

export function CustomCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Check if device supports hover
    const matchMedia = window.matchMedia("(hover: hover)");
    if (!matchMedia.matches) {
      setIsTouchDevice(true);
      return;
    }

    let requestRef: number;
    let mouseX = 0;
    let mouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!requestRef) {
        requestRef = requestAnimationFrame(updatePosition);
      }
    };

    const updatePosition = () => {
      setPosition({ x: mouseX, y: mouseY });
      requestRef = 0;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const isInteractive = 
        target.tagName.toLowerCase() === "a" ||
        target.tagName.toLowerCase() === "button" ||
        target.getAttribute("role") === "button" ||
        target.closest("a") ||
        target.closest("button") ||
        target.closest("[role='button']") ||
        window.getComputedStyle(target).cursor === "pointer";

      setIsHovering(Boolean(isInteractive));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseover", handleMouseOver);

    // Apply global cursor none
    const style = document.createElement("style");
    style.innerHTML = `* { cursor: none !important; }`;
    document.head.appendChild(style);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseover", handleMouseOver);
      if (requestRef) cancelAnimationFrame(requestRef);
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  if (isTouchDevice) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 99999,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        transition: "width 0.15s ease, height 0.15s ease, background-color 0.15s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Default state is a thin vertical line
        width: isHovering ? "auto" : "2px",
        height: isHovering ? "auto" : "18px",
        backgroundColor: isHovering ? "transparent" : "#a78bfa",
        marginTop: isHovering ? "-12px" : "-9px", // center alignment offset
        marginLeft: isHovering ? "-10px" : "-1px",
      }}
    >
      {isHovering && (
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "#a78bfa",
            fontSize: "1.2rem",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            textShadow: "0 0 8px rgba(167, 139, 250, 0.4)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
          }}
        >
          &gt;_
        </span>
      )}
    </div>
  );
}
