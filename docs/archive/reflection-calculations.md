# Mirror Steering & Solar Spot Geometry — **Developer Spec (Revised)**

This spec gives you everything to:

1. place a grid pattern on any wall plane at a chosen height offset,
2. solve **per-mirror yaw/pitch** with the correct zero reference (**mirror normal = wall normal**), and
3. compute each reflected pixel’s **ellipse** on the wall (size & orientation).

---

## Inputs

**Environment (fixed)**

- **Mirror array geometry**
  - Center-to-center spacing: `s_x`, `s_y` (mm)
  - Array origin & basis:
    - `p0` (3D): center of mirror (0,0)
    - `û_arr`, `v̂_arr` (unit): array column/row directions in world
    - Per-mirror center: `p_m[i,j] = p0 + i*s_x*û_arr + j*s_y*v̂_arr`
- **Wall plane**
  - Point on wall: `p_w0` (3D)
  - Wall normal (unit, points “out” of wall): `ŵ`
- **Incoming light**
  - Unit **direction of travel** (Sun → mirror): `î`
- **Projection height (offset)**
  - Scalar `H` (mm): vertical offset along the wall’s vertical, relative to the (0,0) mirror’s projection

**Frame helpers**

- World “up”: `ẑ` (e.g., (0,0,1))
- Wall-vertical: `v̂_wall = normalize(ẑ − (ẑ·ŵ) ŵ)`
- Wall-horizontal: `û_wall = normalize(v̂_wall × ŵ)`
  > If `|ẑ·ŵ| ≈ 1`, pick any stable in-plane vertical (e.g., from array axes) before forming `û_wall`.

**Pattern (variable)**

- Pixel grid indices `(i,j)` with desired **wall** spacings (mm) between pixel centers: `P_x`, `P_y`.
  - For 1:1 copy of mirror spacing on wall: `P_x = s_x`, `P_y = s_y`.

---

## Outputs (per mirror / pixel)

1. **Angles** (zero when mirror normal is perpendicular to the wall, i.e., `n̂ = ŵ`)
   - `yaw[i,j]` — rotation about `v̂_wall`
   - `pitch[i,j]` — rotation about `û_wall`

2. **Ellipse of reflected Sun on the wall**
   - Center: `p_hit[i,j]` (3D on wall)
   - In-plane unit axes: `â[i,j]` (major), `b̂[i,j]` (minor)
   - Diameters: `D_major[i,j]`, `D_minor[i,j]`

---

## Procedure

### 0) Helpers

- `normalize(v) = v / ||v||`
- `ray_plane(p, r̂, p_w0, ŵ):  t = ((p_w0 − p)·ŵ) / (r̂·ŵ);  hit = p + t r̂`

---

### 1) Build the target pattern on the wall

- Project the origin mirror (0,0) center onto the wall along `ŵ`:
  p_ref = p_m[0,0] + ((p_w0 − p_m[0,0])·ŵ) ŵ

- Apply the requested vertical offset:
  p_pat0 = p_ref + H \* v̂_wall

- Desired wall point for pixel (i,j):
  \[
  \boxed{\,p*t[i,j] = p*{\text{pat0}} + i\,P*x\,\hat u*{\text{wall}} + j\,P*y\,\hat v*{\text{wall}}\,}
  \]
  (This locks the wall pattern exactly, independent of array/wall angles.)

---

### 2) Aim each mirror to its target

For mirror center `p_m[i,j]`:

- **Outgoing** unit direction to target:
  r̂ = normalize( p_t[i,j] − p_m[i,j] )

- **Required mirror normal** (specular bisector):
  \[
  \boxed{\,\hat n = \mathrm{normalize}\!\left(r̂ - \hat i\right)\,}
  \]
- Rationale: the normal bisects the angle between the **reflected** ray `r̂` and the **reverse** of the incoming ray at the mirror (`−î`).
- Guard degeneracy when `r̂ ≈ î` (then the bisector magnitude → 0).

---

### 3) Convert normal → yaw/pitch (wall-referenced, exact)

Use the wall-fixed orthonormal basis `{û_wall, v̂_wall, ŵ}`. Let:
n_u = n̂·û_wall
n_v = n̂·v̂_wall
n_w = n̂·ŵ

Define yaw as rotation **about `v̂_wall`**, then pitch as rotation **about `û_wall`**, both from the zero pose `n̂ = ŵ`.  
The **exact** inverse mapping from `n̂` to angles is:
\[
\boxed{\,\text{yaw} = \operatorname{atan2}\!\big(n_u,\; \sqrt{n_v^2 + n_w^2}\big),\qquad
\text{pitch} = \operatorname{atan2}(-n_v,\; n_w)\,}
\]

- This pair exactly inverts the sequence “yaw about `v̂_wall` then pitch about `û_wall`”.
- Clamp/guard only as needed for numerical stability.

> **Sanity check (forward map)**:  
> If `yaw=ψ`, `pitch=θ`, then in `{û_wall, v̂_wall, ŵ}`  
> `n̂ = (sinψ, −cosψ sinθ, cosψ cosθ)`.

---

### 4) Compute the ellipse on the wall

- **Ray–wall intersection** (should land at `p_t[i,j]`):
  den = r̂·ŵ # require |den| > ε
  t = ((p_w0 − p_m[i,j]) · ŵ) / den
  require t > 0
  p_hit[i,j] = p_m[i,j] + t \* r̂

- **Incidence cosine**:
  c = |den| # = |r̂·ŵ|

- **In-plane major/minor directions**:
  â = normalize( r̂ − (r̂·ŵ) ŵ ) # major-axis direction in the wall plane
  b̂ = normalize( ŵ × â ) # minor-axis direction

- **Diameters** using Sun’s angular diameter `Θ☉ ≈ 0.53° = 9.25e−3 rad`:
  \[
  \boxed{\,D*{\text{minor}} = 2\,t\,\tan\!\big(\tfrac{Θ☉}{2}\big),\qquad
  D*{\text{major}} = \frac{D\_{\text{minor}}}{c}\,}
  \]
- With surface slope blur RMS `σ` (radians), use  
  \[
  Θ*{\text{eff}} = \sqrt{Θ*{☉}^{2} + (2σ)^{2}}
  \]
  in place of `Θ☉`.

---

## Minimal Pseudocode (per mirror)

```python
# Given: p0, û_arr, v̂_arr, s_x, s_y
#        p_w0, ŵ
#        î  (Sun → mirror)
#        ẑ  (world up)
#        P_x, P_y, H

# Wall basis
v_wall = ẑ - (ẑ @ ŵ) * ŵ
v_wall = v_wall / np.linalg.norm(v_wall)
u_wall = np.cross(v_wall, ŵ)
u_wall = u_wall / np.linalg.norm(u_wall)

# Origins
p_m00  = p0
p_ref  = p_m00 + ((p_w0 - p_m00) @ ŵ) * ŵ
p_pat0 = p_ref + H * v_wall

def solve_mirror(i, j, theta_sun=0.00925, eps=1e-6):
  # Mirror & target
  p_m = p0 + i*s_x*û_arr + j*s_y*v̂_arr
  p_t = p_pat0 + i*P_x*u_wall + j*P_y*v_wall

  # Rays and normal (specular)
  r_hat = normalize(p_t - p_m)                 # mirror → wall
  n_vec = r_hat - î                            # bisector with -î
  n_norm = np.linalg.norm(n_vec)
  if n_norm < eps:
      raise ValueError("Degenerate bisector: r̂ ≈ î.")
  n_hat = n_vec / n_norm

  # Exact yaw/pitch (zero when n̂ = ŵ)
  n_u = float(n_hat @ u_wall)
  n_v = float(n_hat @ v_wall)
  n_w = float(n_hat @ ŵ)
  yaw   = math.atan2(n_u, math.sqrt(max(0.0, n_v*n_v + n_w*n_w)))
  pitch = math.atan2(-n_v, n_w)

  # Ellipse on wall
  den = float(r_hat @ ŵ)
  if abs(den) < eps:
      raise ValueError("Grazing incidence; cannot intersect wall.")
  t = float(((p_w0 - p_m) @ ŵ) / den)
  if t <= 0:
      raise ValueError("Wall lies behind the mirror along r̂.")
  p_hit = p_m + t * r_hat

  a_dir = normalize(r_hat - den * ŵ)           # major-axis dir
  b_dir = normalize(np.cross(ŵ, a_dir))        # minor-axis dir

  D_minor = 2 * t * math.tan(theta_sun / 2.0)
  D_major = D_minor / abs(den)

  return {
      "yaw": yaw, "pitch": pitch,
      "hit": p_hit,
      "ellipse": {"a_dir": a_dir, "b_dir": b_dir,
                  "D_major": D_major, "D_minor": D_minor}
  }
```

Notes & Constraints

- Mirror size affects power & mechanical limits only; it does not change the solar disk size on the wall. The ellipse is set by Sun angular size and geometry.
- If |r̂·ŵ| → 0 (grazing), t and D_major blow up—reject such targets.
- Ensure your gimbal’s angle limits & handedness match this yaw/pitch convention.
- To rotate the wall pattern, rotate {û_wall, v̂_wall} within the wall plane before Step (1).
- Units: use radians for angles, mm for lengths. Clamp where noted; keep tolerances (eps) consistent across the code.

⸻

Key Corrections vs. Typical Pitfalls

- Specular bisector: with î defined Sun → mirror, the correct bisector is n̂ = normalize(r̂ − î) (not the sum).
- Angles: yaw = atan2(n_u, sqrt(n_v²+n_w²)), pitch = atan2(-n_v, n_w) gives the exact yaw-then-pitch decomposition about {v̂_wall, û_wall} from n̂. Using atan2(n_u, n_w) and asin(n_v) only matches when one angle is ~0.
