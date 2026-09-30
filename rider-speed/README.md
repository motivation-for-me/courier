# Delivery rider speed loop

A self-contained Three.js scene built from `assets/logo.jpg`.

Run from the repository root:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173/demo/rider-speed/`.

The reference remains the visual source of truth while procedural Three.js layers provide wheel rotation, suspension/bob, camera tracking vibration, ground contact, and restrained speed streaks. The loop is time-periodic and the controls can pause motion or disable the speed effects.
