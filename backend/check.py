from analysis import *

a, f = load_data("data")
c = build_comparison(a, f)
print((c.forecast / c.actual).describe())
c["day"] = c.startTime.dt.date
print(c.groupby("day").error.mean())
print(a.generation.max(), f.generation.max())