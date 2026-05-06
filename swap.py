with open('src/components/bahrain/BahrainDashboard.tsx', 'r') as f:
    lines = f.readlines()

urgent = lines[287:323]
workload = lines[323:375]
category = lines[375:424]

# We want: Urgent, Category, Workload
new_lines = lines[:323] + category + workload + lines[424:]

with open('src/components/bahrain/BahrainDashboard.tsx', 'w') as f:
    f.writelines(new_lines)
