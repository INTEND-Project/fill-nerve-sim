---
name: fill-system-reasoning
description: Infer required FILL workloads from user intent by mapping services to components and components to containers. Use when users describe desired machine analytics outcomes but do not provide explicit workload names.
---

# FILL System Reasoning

This is about how to interpret the user intent and decide which workloads should be deployed.

## How to reason (FOLLOW THESE STEPS EXACTLY)

1. Match user intent keywords against the service descriptions and service quick reference below.
2. Select exactly one most relevant service (`Service1`-`Service12`).
3. Find all components for that service using `intend:hasComponent`.
4. For every selected component, find all containers using `intend:hasContainer`.
5. **If a machine type is provided** (e.g., "Machine1"), filter the container list using the `intend:canBeDeployedOn` triples. Only keep containers that have `intend:canBeDeployedOn fill:<MachineType>`. If a container does NOT have a `canBeDeployedOn` entry for the given machine type, REMOVE it from the list.
6. **If no machine type is provided**, return all containers without filtering.
7. Return only the final container names (without `fill:` prefix), one per line.
8. Do not include containers from other services.
9. Do not include explanations, prefixes, components, or services in the output.

## Service quick reference

- Service1 = Prod Data (production transparency)
- Service2 = Machine State (machine status overview)
- Service3 = Energy Tracker (leakage detection)
- Service4 = KPI Analyzer (utilization analysis)
- Service5 = Alarm Analyzer (alarm recording)
- Service6 = Data Xplorer (manual data analysis)
- Service7 = Program History (NC program tracking)
- Service8 = G-Code Analyzer (G-code optimization)
- Service9 = Thermo Stability (temperature range)
- Service10 = Tool Performance (tool wear analysis)
- Service11 = Logbook (component change logging)
- Service12 = Fingerprint (machine performance indicator)

## Locate the right service

These are all the services FILL provides for their machines, each with a name of a short description.

```turtle
fill:Service1 intend:description "Prod Data: Service1 records all components and the process steps are analyzed. Occurred messages and the tool usage of each component are displayed and provide transparency in the production data.".
fill:Service2 intend:description "Machine State: Service2 provides an overview of your production. The machine status can be called up at any time, allowing workflows to be optimized.".
fill:Service3 intend:description "Energy Tracker: Service3 monitors media consumption and ensures early detection of production changes and leaks that might otherwise go undetected.".
fill:Service4 intend:description "KPI Analyzer: Service4 provides information on the utilization of a machine in a defined period. The analysis provides insights into utilization and efficiency and identifies any bottlenecks or optimization potential.".
fill:Service5 intend:description "Alarm Analyzer: Service5 records all alarms and messages and identifies the main messages. Actual machine problems can thus be identified.".
fill:Service6 intend:description "Data Xplorer: Service6 allows manual analysis of all recorded data. Any questions can thus be clarified independently.".
fill:Service7 intend:description "Program History: Service7 automatically records every NC program change. The possibility of analysis and tracking provides more transparency and control.".
fill:Service8 intend:description "G-Code Analyzer: Service8 analyzes the G-code of all components. Optimization potential is suggested to effectively reduce cycle time.".
fill:Service9 intend:description "Thermo Stability: Service9 detects the constant temperature range for efficient production. This saves time and reduces scrap due to a shorter warm-up phase.".
fill:Service10 intend:description "Tool Performance: Service10 analyzes tool wear. You can determine the condition when replacing tools or compare wear among tools of the same type.".
fill:Service11 intend:description "Logbook: Service11 logs component changes of motors, spindles and ball screws. In addition, every machine crash is recorded, including the program run.".
fill:Service12 intend:description "Fingerprint: Service12 test runs generate the specific machine performance indicator. This allows you to detect changes over time and check successful installation after component replacement.".
```

## Find the components in the service

```turtle
fill:Service1 intend:hasComponent fill:Component1.
fill:Service1 intend:hasComponent fill:Component2.
fill:Service1 intend:hasComponent fill:Component3.
fill:Service1 intend:hasComponent fill:Component6.
fill:Service1 intend:hasComponent fill:Container30.
fill:Service1 intend:hasComponent fill:Component12.
fill:Service2 intend:hasComponent fill:Component4.
fill:Service3 intend:hasComponent fill:Component1.
fill:Service3 intend:hasComponent fill:Component4.
fill:Service3 intend:hasComponent fill:Component5.
fill:Service4 intend:hasComponent fill:Component1.
fill:Service4 intend:hasComponent fill:Component4.
fill:Service5 intend:hasComponent fill:Component6.
fill:Service7 intend:hasComponent fill:Component1.
fill:Service7 intend:hasComponent fill:Component2.
fill:Service7 intend:hasComponent fill:Component3.
fill:Service7 intend:hasComponent fill:Container30.
fill:Service8 intend:hasComponent fill:Component10.
fill:Service8 intend:hasComponent fill:Component11.
fill:Service10 intend:hasComponent fill:Component2.
fill:Service10 intend:hasComponent fill:Component3.
fill:Service10 intend:hasComponent fill:Component13.
fill:Service11 intend:hasComponent fill:Component4.
fill:Service11 intend:hasComponent fill:Container30.
fill:Service11 intend:hasComponent fill:Component8.
fill:Service11 intend:hasComponent fill:Component9.
fill:Service12 intend:hasComponent fill:Component8.
fill:Service12 intend:hasComponent fill:Component9.
```

## Step 3: Find the containers inside each component

```
fill:Component1 intend:hasContainer fill:Container1.
fill:Component1 intend:hasContainer fill:Container2.
fill:Component1 intend:hasContainer fill:Container3.
fill:Component1 intend:hasContainer fill:Container4.
fill:Component1 intend:hasContainer fill:Container5.
fill:Component1 intend:hasContainer fill:Container6.
fill:Component1 intend:hasContainer fill:Container7.
fill:Component1 intend:hasContainer fill:Container8.
fill:Component1 intend:hasContainer fill:Container9.
fill:Component1 intend:hasContainer fill:Container10.
fill:Component2 intend:hasContainer fill:Container11.
fill:Component2 intend:hasContainer fill:Container12.
fill:Component2 intend:hasContainer fill:Container13.
fill:Component2 intend:hasContainer fill:Container14.
fill:Component2 intend:hasContainer fill:Container15.
fill:Component2 intend:hasContainer fill:Container16.
fill:Component3 intend:hasContainer fill:Container17.
fill:Component3 intend:hasContainer fill:Container18.
fill:Component12 intend:hasContainer fill:Container19.
fill:Component12 intend:hasContainer fill:Container20.
fill:Component13 intend:hasContainer fill:Container21.
fill:Component13 intend:hasContainer fill:Container22.
fill:Component4 intend:hasContainer fill:Container23.
fill:Component4 intend:hasContainer fill:Container24.
fill:Component5 intend:hasContainer fill:Container25.
fill:Component5 intend:hasContainer fill:Container26.
fill:Component5 intend:hasContainer fill:Container27.
fill:Component5 intend:hasContainer fill:Container28.
fill:Component6 intend:hasContainer fill:Container29.
fill:Container30 intend:hasContainer fill:Container30.
fill:Component10 intend:hasContainer fill:Container31.
fill:Component10 intend:hasContainer fill:Container32.
fill:Component10 intend:hasContainer fill:Container33.
fill:Component10 intend:hasContainer fill:Container34.
fill:Component10 intend:hasContainer fill:Container35.
fill:Component10 intend:hasContainer fill:Container36.
fill:Component10 intend:hasContainer fill:Container37.
fill:Component10 intend:hasContainer fill:Container38.
fill:Component11 intend:hasContainer fill:Container39.
fill:Component8 intend:hasContainer fill:Container40.
fill:Component8 intend:hasContainer fill:Container41.
fill:Component14 intend:hasContainer fill:Container42.
```

## Step 4: Filter containers by machine type compatibility

If a machine type is provided (e.g., "Machine1"), use the triples below to filter. Only keep containers that have `intend:canBeDeployedOn fill:<MachineType>`. Remove any container that is NOT listed for the given machine type.

If no machine type is provided, skip this step and return all containers from Step 3.

```turtle
fill:Container1 intend:canBeDeployedOn fill:Machine1.
fill:Container1 intend:canBeDeployedOn fill:Machine2.
fill:Container1 intend:canBeDeployedOn fill:Machine3.
fill:Container1 intend:canBeDeployedOn fill:Machine4.
fill:Container1 intend:canBeDeployedOn fill:Machine5.
fill:Container2 intend:canBeDeployedOn fill:Machine1.
fill:Container2 intend:canBeDeployedOn fill:Machine2.
fill:Container2 intend:canBeDeployedOn fill:Machine3.
fill:Container2 intend:canBeDeployedOn fill:Machine4.
fill:Container3 intend:canBeDeployedOn fill:Machine2.
fill:Container3 intend:canBeDeployedOn fill:Machine3.
fill:Container4 intend:canBeDeployedOn fill:Machine2.
fill:Container4 intend:canBeDeployedOn fill:Machine3.
fill:Container5 intend:canBeDeployedOn fill:Machine1.
fill:Container5 intend:canBeDeployedOn fill:Machine2.
fill:Container5 intend:canBeDeployedOn fill:Machine3.
fill:Container5 intend:canBeDeployedOn fill:Machine4.
fill:Container5 intend:canBeDeployedOn fill:Machine5.
fill:Container6 intend:canBeDeployedOn fill:Machine4.
fill:Container6 intend:canBeDeployedOn fill:Machine5.
fill:Container7 intend:canBeDeployedOn fill:Machine4.
fill:Container10 intend:canBeDeployedOn fill:Machine4.
fill:Container10 intend:canBeDeployedOn fill:Machine5.
fill:Container11 intend:canBeDeployedOn fill:Machine1.
fill:Container11 intend:canBeDeployedOn fill:Machine2.
fill:Container11 intend:canBeDeployedOn fill:Machine3.
fill:Container11 intend:canBeDeployedOn fill:Machine4.
fill:Container11 intend:canBeDeployedOn fill:Machine5.
fill:Container12 intend:canBeDeployedOn fill:Machine1.
fill:Container12 intend:canBeDeployedOn fill:Machine2.
fill:Container12 intend:canBeDeployedOn fill:Machine3.
fill:Container12 intend:canBeDeployedOn fill:Machine4.
fill:Container13 intend:canBeDeployedOn fill:Machine3.
fill:Container14 intend:canBeDeployedOn fill:Machine3.
fill:Container15 intend:canBeDeployedOn fill:Machine4.
fill:Container15 intend:canBeDeployedOn fill:Machine5.
fill:Container16 intend:canBeDeployedOn fill:Machine4.
fill:Container17 intend:canBeDeployedOn fill:Machine1.
fill:Container17 intend:canBeDeployedOn fill:Machine2.
fill:Container17 intend:canBeDeployedOn fill:Machine3.
fill:Container17 intend:canBeDeployedOn fill:Machine4.
fill:Container17 intend:canBeDeployedOn fill:Machine5.
fill:Container18 intend:canBeDeployedOn fill:Machine4.
fill:Container18 intend:canBeDeployedOn fill:Machine5.
fill:Container19 intend:canBeDeployedOn fill:Machine1.
fill:Container19 intend:canBeDeployedOn fill:Machine2.
fill:Container19 intend:canBeDeployedOn fill:Machine3.
fill:Container19 intend:canBeDeployedOn fill:Machine4.
fill:Container19 intend:canBeDeployedOn fill:Machine5.
fill:Container20 intend:canBeDeployedOn fill:Machine4.
fill:Container20 intend:canBeDeployedOn fill:Machine5.
fill:Container21 intend:canBeDeployedOn fill:Machine1.
fill:Container21 intend:canBeDeployedOn fill:Machine2.
fill:Container21 intend:canBeDeployedOn fill:Machine3.
fill:Container21 intend:canBeDeployedOn fill:Machine4.
fill:Container21 intend:canBeDeployedOn fill:Machine5.
fill:Container22 intend:canBeDeployedOn fill:Machine4.
fill:Container22 intend:canBeDeployedOn fill:Machine5.
fill:Container23 intend:canBeDeployedOn fill:Machine1.
fill:Container23 intend:canBeDeployedOn fill:Machine2.
fill:Container23 intend:canBeDeployedOn fill:Machine3.
fill:Container23 intend:canBeDeployedOn fill:Machine4.
fill:Container23 intend:canBeDeployedOn fill:Machine5.
fill:Container24 intend:canBeDeployedOn fill:Machine4.
fill:Container24 intend:canBeDeployedOn fill:Machine5.
fill:Container25 intend:canBeDeployedOn fill:Machine1.
fill:Container25 intend:canBeDeployedOn fill:Machine2.
fill:Container25 intend:canBeDeployedOn fill:Machine3.
fill:Container25 intend:canBeDeployedOn fill:Machine4.
fill:Container25 intend:canBeDeployedOn fill:Machine5.
fill:Container26 intend:canBeDeployedOn fill:Machine1.
fill:Container26 intend:canBeDeployedOn fill:Machine2.
fill:Container26 intend:canBeDeployedOn fill:Machine4.
fill:Container26 intend:canBeDeployedOn fill:Machine5.
fill:Container27 intend:canBeDeployedOn fill:Machine3.
fill:Container27 intend:canBeDeployedOn fill:Machine4.
fill:Container27 intend:canBeDeployedOn fill:Machine5.
fill:Container28 intend:canBeDeployedOn fill:Machine4.
fill:Container28 intend:canBeDeployedOn fill:Machine5.
fill:Container29 intend:canBeDeployedOn fill:Machine1.
fill:Container29 intend:canBeDeployedOn fill:Machine2.
fill:Container29 intend:canBeDeployedOn fill:Machine3.
fill:Container29 intend:canBeDeployedOn fill:Machine4.
fill:Container29 intend:canBeDeployedOn fill:Machine5.
fill:Container30 intend:canBeDeployedOn fill:Machine1.
fill:Container30 intend:canBeDeployedOn fill:Machine2.
fill:Container30 intend:canBeDeployedOn fill:Machine3.
fill:Container30 intend:canBeDeployedOn fill:Machine4.
fill:Container30 intend:canBeDeployedOn fill:Machine5.
fill:Container31 intend:canBeDeployedOn fill:Machine1.
fill:Container31 intend:canBeDeployedOn fill:Machine4.
fill:Container31 intend:canBeDeployedOn fill:Machine5.
fill:Container32 intend:canBeDeployedOn fill:Machine1.
fill:Container32 intend:canBeDeployedOn fill:Machine4.
fill:Container33 intend:canBeDeployedOn fill:Machine1.
fill:Container33 intend:canBeDeployedOn fill:Machine4.
fill:Container33 intend:canBeDeployedOn fill:Machine5.
fill:Container34 intend:canBeDeployedOn fill:Machine1.
fill:Container34 intend:canBeDeployedOn fill:Machine4.
fill:Container34 intend:canBeDeployedOn fill:Machine5.
fill:Container35 intend:canBeDeployedOn fill:Machine4.
fill:Container35 intend:canBeDeployedOn fill:Machine5.
fill:Container36 intend:canBeDeployedOn fill:Machine4.
fill:Container37 intend:canBeDeployedOn fill:Machine4.
fill:Container37 intend:canBeDeployedOn fill:Machine5.
fill:Container38 intend:canBeDeployedOn fill:Machine4.
fill:Container38 intend:canBeDeployedOn fill:Machine5.
fill:Container39 intend:canBeDeployedOn fill:Machine1.
fill:Container39 intend:canBeDeployedOn fill:Machine2.
fill:Container39 intend:canBeDeployedOn fill:Machine4.
fill:Container39 intend:canBeDeployedOn fill:Machine5.
fill:Container40 intend:canBeDeployedOn fill:Machine1.
fill:Container40 intend:canBeDeployedOn fill:Machine2.
fill:Container41 intend:canBeDeployedOn fill:Machine1.
fill:Container41 intend:canBeDeployedOn fill:Machine2.
fill:Container42 intend:canBeDeployedOn fill:Machine1.
fill:Container42 intend:canBeDeployedOn fill:Machine2.
fill:Container42 intend:canBeDeployedOn fill:Machine3.
```
