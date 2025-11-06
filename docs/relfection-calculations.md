# Mirror Steering & Solar Spot Geometry - Developer Notes

This reference shows how to:

1. compute mirror pitch/yaw to hit a desired wall point, and
2. compute the Sun image (ellipse) on that wall.

---

## Coordinate Setup

Use a single right-handed world frame.

- Mirror center: `p_m` in `R^3`
- Wall plane: reference point `p_w0`, unit normal `w_hat` (points "out" of the wall)
- Desired hit point on the wall: `p_t` (must lie in the wall plane)
- Incoming light direction of travel (unit): `i_hat`
- For the Sun: `i_hat` points from Sun to mirror. If you store a Sun look-vector `s_hat` (mirror -> Sun), then `i_hat = -s_hat`.

Unit vectors are denoted with a hat suffix (for example `r_hat`). Normalize every direction you compute.

---

## Specular Reflection Relations

- Reflected direction (unit): `r_hat = i_hat - 2 * dot(i_hat, n_hat) * n_hat`
- If `i_hat` and `r_hat` are known, the required mirror normal is the signed angle bisector: `n_hat = normalize(r_hat - i_hat)`

---

## 1. Mirror Angles to Hit a Desired Wall Point

**Inputs:** `p_m`, `p_t`, `i_hat`  
**Outputs:** mirror normal `n_hat`, optional gimbal pitch/yaw

1. Outgoing direction to target: `r_hat = normalize(p_t - p_m)`
2. Mirror normal (bisector): `n_hat = normalize(r_hat - i_hat)`
3. (Optional) Convert `n_hat` to gimbal angles. Assume the zero-pose normal is `n0 = (0, 0, 1)` and rotation order `R_y(yaw) * R_x(pitch)` maps `n0` to `n_hat`:
   - `yaw = atan2(n_x, n_z)`
   - `pitch = atan2(-n_y, sqrt(n_x^2 + n_z^2))`

**Ray/plane intersection** (if you start from a direction instead of `p_t`):

`t = dot(p_w0 - p_m, w_hat) / dot(r_hat, w_hat)`  
`p_hit = p_m + t * r_hat`

Guard for `abs(dot(r_hat, w_hat)) > epsilon` to avoid near-parallel intersections.

---

## 2. Solar Image (Ellipse) on the Wall

The Sun's apparent angular diameter is `Theta_sun approx 0.53 deg approx 9.25 mrad`.

**Definitions**

- Reflected direction: `r_hat` (from the previous section)
- Wall normal: `w_hat`
- Incidence angle on the wall: `cos(alpha) = |dot(r_hat, w_hat)|`
- Path length mirror -> wall: `t` from the intersection formula above
- In-plane major-axis direction (projection of `r_hat` onto the wall plane): `a_hat = normalize(r_hat - dot(r_hat, w_hat) * w_hat)`
- In-plane minor-axis direction: `b_hat = cross(w_hat, a_hat)`

**Exact small-cone mapping**

- Minor-axis diameter: `D_min = 2 * t * tan(Theta_sun / 2)`
- Major-axis diameter: `D_max = D_min / |dot(r_hat, w_hat)| = 2 * t * tan(Theta_sun / 2) / cos(alpha)`

**Small-angle rule of thumb**

- `D_min approx t * Theta_sun`
- `D_max approx (t * Theta_sun) / cos(alpha)`

**Optional blur from mirror slope error** (RMS slope `sigma` in radians):

Reflection doubles slope; combine in quadrature with the solar disk:

`Theta_eff approx sqrt(Theta_sun^2 + (2 * sigma)^2)`

Replace `Theta_sun` with `Theta_eff` in the formulas above (and keep the `1 / cos(alpha)` stretch for the major axis).

---

## Minimal Pseudocode

```python
import numpy as np


def normalize(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


# Aim to target
r_hat = normalize(p_t - p_m)
n_hat = normalize(r_hat - i_hat)

# Optional: angles from n_hat; assumes zero normal (0, 0, 1) and yaw->pitch order
nx, ny, nz = n_hat
yaw = np.arctan2(nx, nz)
pitch = np.arctan2(-ny, np.sqrt(nx * nx + nz * nz))

# Intersect wall to get path length t and hit point
den = float(np.dot(r_hat, w_hat))
assert abs(den) > 1e-9, "Ray nearly parallel to wall"
t = float(np.dot(p_w0 - p_m, w_hat) / den)
p_hit = p_m + t * r_hat

# Ellipse axes in the wall plane
alpha_cos = abs(den)
a_dir = normalize(r_hat - alpha_cos * w_hat)
b_dir = np.cross(w_hat, a_dir)

theta_sun = np.deg2rad(0.53)  # Sun angular diameter
D_min = 2 * t * np.tan(theta_sun / 2.0)
D_max = D_min / alpha_cos

ellipse = {
    "center": p_hit,
    "a_dir": a_dir,
    "b_dir": b_dir,
    "D_major": D_max,
    "D_minor": D_min,
}
```

---

## Sanity Checks and Edge Cases

- Degenerate aim: if `r_hat` approx `i_hat`, no physical `n_hat` (that is transmission, not reflection).
- Grazing incidence: if `|dot(r_hat, w_hat)|` -> 0, the ellipse diverges (`D_max` -> infinity).
- Be explicit about your gimbal axis order and zero pose; adjust the yaw/pitch mapping accordingly.
- For indoor laser tests, replace `Theta_sun` with the laser beam divergence (radians) to predict spot size the same way.

---

## Constants

- Solar angular diameter: `Theta_sun approx 0.53 deg` (varies by about +/-3.4% over the year).
- Small-angle shortcut: `tan(Theta / 2) approx Theta / 2` for `Theta` in radians.
