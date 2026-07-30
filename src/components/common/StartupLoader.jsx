import { useEffect, useRef } from "react";

const LOADER_PATH = "/animations/game-loader.json";

export function StartupLoader({ isLeaving = false, onComplete }) {
  const animationRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    let animation;
    let cancelled = false;

    const finish = () => {
      if (cancelled || completedRef.current) return;
      completedRef.current = true;
      onComplete?.();
    };

    async function mountAnimation() {
      try {
        const lottieModule = await import("lottie-web/build/player/lottie_light");
        const lottie = lottieModule.default ?? lottieModule;

        if (cancelled || !animationRef.current) return;

        animation = lottie.loadAnimation({
          container: animationRef.current,
          renderer: "svg",
          loop: false,
          autoplay: true,
          path: LOADER_PATH,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid meet",
            progressiveLoad: true,
          },
        });

        animation.addEventListener("complete", finish);
        animation.addEventListener("data_failed", finish);
      } catch (error) {
        console.error("No se pudo cargar la animacion de inicio de GAME.", error);
        finish();
      }
    }

    mountAnimation();

    return () => {
      cancelled = true;
      if (!animation) return;
      animation.removeEventListener("complete", finish);
      animation.removeEventListener("data_failed", finish);
      animation.destroy();
    };
  }, [onComplete]);

  return (
    <div className={`startup-loader${isLeaving ? " startup-loader--leaving" : ""}`} role="status" aria-label="Cargando GAME">
      <div className="startup-loader__animation" ref={animationRef} />
    </div>
  );
}
