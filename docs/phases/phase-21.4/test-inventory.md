# Phase 21.4 Test Inventory

| Package                   | Classification   | Runtime logic         | Test files |  Test cases | Meaningful tests      | Coverage     | Justification if no tests                                      |
| ------------------------- | ---------------- | --------------------- | ---------: | ----------: | --------------------- | ------------ | -------------------------------------------------------------- |
| @irp/api                  | APPLICATION      | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/cli                  | APPLICATION      | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/daemon               | APPLICATION      | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/dashboard            | UI               | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/desktop              | APPLICATION      | yes                   |          3 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/auth                 | CRITICAL_RUNTIME | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/config               | CONFIGURATION    | type/contract/example |        141 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/connectivity         | CORE_DOMAIN      | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/core                 | CRITICAL_RUNTIME | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/database             | INFRASTRUCTURE   | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/dns                  | CORE_DOMAIN      | yes                   |          2 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/events               | INFRASTRUCTURE   | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/failover             | CORE_DOMAIN      | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/kernel               | INFRASTRUCTURE   | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/logger               | INFRASTRUCTURE   | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/network              | CORE_DOMAIN      | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/network-intelligence | CORE_DOMAIN      | yes                   |          2 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/plugin-api           | PLUGIN           | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/plugin-config        | PLUGIN           | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/plugin-events        | PLUGIN           | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/plugin-loader        | PLUGIN           | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/plugin-manager       | PLUGIN           | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/plugin-registry      | PLUGIN           | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/plugin-runtime       | PLUGIN           | yes                   |          0 | NOT_COUNTED | missing               | NOT_REPORTED | MISSING: runtime-capable package still needs behavioral tests. |
| @irp/plugin-samples       | EXAMPLE          | type/contract/example |          0 | NOT_COUNTED | documented-no-runtime | NOT_REPORTED | Pure type/SDK/example package; compile-time contract required. |
| @irp/plugin-sandbox       | PLUGIN           | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/plugin-sdk           | SDK              | type/contract/example |          0 | NOT_COUNTED | documented-no-runtime | NOT_REPORTED | Pure type/SDK/example package; compile-time contract required. |
| @irp/queue                | INFRASTRUCTURE   | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/routing              | CORE_DOMAIN      | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @platform/sdk             | SDK              | type/contract/example |          0 | NOT_COUNTED | documented-no-runtime | NOT_REPORTED | Pure type/SDK/example package; compile-time contract required. |
| @irp/security             | CRITICAL_RUNTIME | yes                   |          2 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/shared               | TYPES            | type/contract/example |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/telemetry            | INFRASTRUCTURE   | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/tunnel               | CORE_DOMAIN      | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
| @irp/types                | TYPES            | type/contract/example |          0 | NOT_COUNTED | documented-no-runtime | NOT_REPORTED | Pure type/SDK/example package; compile-time contract required. |
| @irp/utils                | INFRASTRUCTURE   | yes                   |          1 | NOT_COUNTED | yes                   | NOT_REPORTED |                                                                |
