# Demo walkthrough

Every request and every response below was recorded against the running
service, not written by hand. Reproduce it with:

```bash
cd cap && npm install && npm start
```

The users come from the mocked authentication in `cap/package.json`:

| User | Roles |
|------|-------|
| `rita` | Requester |
| `tom`  | Requester, ApproverL1 |
| `dana` | Requester, ApproverL1, ApproverL2 |
| `carl` | ApproverL1, ApproverL2, ApproverL3 |
| `mona` | ProcurementAdmin, Requester |

---

## 1. A requisition that needs the CFO

### Submitting a 112.500 EUR requisition assigns a number and derives the approval path

```http
POST /procurement/PurchaseRequisitions(ID=d0000006-0000-4000-8000-000000000006,IsActiveEntity=true)/ProcurementService.submit
Authorization: Basic (mona)
Content-Type: application/json

{}
```

```json
{
    "@odata.context": "../$metadata#PurchaseRequisitions/$entity",
    "ID": "d0000006-0000-4000-8000-000000000006",
    "createdAt": "2026-09-15T10:10:00.000Z",
    "createdBy": "mona",
    "modifiedAt": "2026-09-17T15:31:40.114Z",
    "modifiedBy": "mona",
    "requisitionNumber": "PR-2026-000006",
    "title": "Development support new product line",
    "description": "External engineering capacity for the new product line. Capital expenditure - CFO sign-off expected.",
    "requester": "mona",
    "costCenter_ID": "cc000002-0000-4000-8000-000000000002",
    "currency_code": "EUR",
    "totalValue": "112500.00",
    "status_code": "IA",
    "supplierRiskClass_code": "A",
    "requiredApprovalLevel_code": 3,
    "currentApprovalLevel": 0,
    "submittedAt": "2026-09-17T15:31:40.114Z",
    "completedAt": null,
    "rejectionReason": null
}
```

The value is above 100.000 EUR, so the matrix demands level 3 - the CFO -
regardless of how good the supplier is.

---

## 2. Separation of duties

### The requester tries to approve her own requisition

```http
POST /procurement/PurchaseRequisitions(ID=d0000002-0000-4000-8000-000000000002,IsActiveEntity=true)/ProcurementService.approve
Authorization: Basic (rita)
Content-Type: application/json

{"comment":"looks fine to me"}
```

```json
{
    "error": {
        "message": "Multiple errors occurred, see details below.",
        "code": "MULTIPLE_ERRORS",
        "details": [
            {
                "message": "You cannot decide on a requisition you raised yourself.",
                "code": "PR008",
                "@Common.numericSeverity": 4
            },
            {
                "message": "Approval level 2 requires the role ApproverL2.",
                "code": "PR010",
                "@Common.numericSeverity": 4
            }
        ],
        "@Common.numericSeverity": 4
    }
}
```

Two rules fire at once, and the service reports both instead of stopping at
the first one.

---

## 3. The approval chain

### A team lead tries to sign off a level he is not entitled to

```http
POST /procurement/PurchaseRequisitions(ID=d0000002-0000-4000-8000-000000000002,IsActiveEntity=true)/ProcurementService.approve
Authorization: Basic (tom)
Content-Type: application/json

{"comment":"ok"}
```

```json
{
    "error": {
        "message": "Approval level 2 requires the role ApproverL2.",
        "code": "PR010",
        "@Common.numericSeverity": 4
    }
}
```

### The department head approves level 2 - the requisition stays in approval

```http
POST /procurement/PurchaseRequisitions(ID=d0000002-0000-4000-8000-000000000002,IsActiveEntity=true)/ProcurementService.approve
Authorization: Basic (dana)
Content-Type: application/json

{"comment":"Budget agreed with R and D."}
```

```json
{
    "@odata.context": "../$metadata#PurchaseRequisitions/$entity",
    "ID": "d0000002-0000-4000-8000-000000000002",
    "createdAt": "2026-09-08T11:02:00.000Z",
    "createdBy": "rita",
    "modifiedAt": "2026-09-17T15:31:40.234Z",
    "modifiedBy": "dana",
    "requisitionNumber": "PR-2026-000002",
    "title": "Microcontrollers series demand 2027",
    "description": "Series demand for the new controller board. Supplier is under increased observation by compliance.",
    "requester": "rita",
    "costCenter_ID": "cc000002-0000-4000-8000-000000000002",
    "currency_code": "EUR",
    "totalValue": "27150.00",
    "status_code": "IA",
    "supplierRiskClass_code": "C",
    "requiredApprovalLevel_code": 3,
    "currentApprovalLevel": 2,
    "submittedAt": "2026-09-09T16:45:00.000Z",
    "completedAt": null,
    "rejectionReason": null
}
```

### The CFO approves level 3 - the requisition is complete

```http
POST /procurement/PurchaseRequisitions(ID=d0000002-0000-4000-8000-000000000002,IsActiveEntity=true)/ProcurementService.approve
Authorization: Basic (carl)
Content-Type: application/json

{"comment":"Approved as capital expenditure."}
```

```json
{
    "@odata.context": "../$metadata#PurchaseRequisitions/$entity",
    "ID": "d0000002-0000-4000-8000-000000000002",
    "createdAt": "2026-09-08T11:02:00.000Z",
    "createdBy": "rita",
    "modifiedAt": "2026-09-17T15:31:40.269Z",
    "modifiedBy": "carl",
    "requisitionNumber": "PR-2026-000002",
    "title": "Microcontrollers series demand 2027",
    "description": "Series demand for the new controller board. Supplier is under increased observation by compliance.",
    "requester": "rita",
    "costCenter_ID": "cc000002-0000-4000-8000-000000000002",
    "currency_code": "EUR",
    "totalValue": "27150.00",
    "status_code": "AP",
    "supplierRiskClass_code": "C",
    "requiredApprovalLevel_code": 3,
    "currentApprovalLevel": 3,
    "submittedAt": "2026-09-09T16:45:00.000Z",
    "completedAt": "2026-09-17T15:31:40.269Z",
    "rejectionReason": null
}
```

---

## 4. The budget check

### A requisition that does not fit into the remaining cost center budget

```http
POST /procurement/PurchaseRequisitions(ID=d0000007-0000-4000-8000-000000000007,IsActiveEntity=true)/ProcurementService.submit
Authorization: Basic (mona)
Content-Type: application/json

{}
```

```json
{
    "error": {
        "message": "Cost center 2000-5001 has 25000.00 left, the requisition asks for 49800.00.",
        "code": "PR006",
        "target": "costCenter_ID",
        "@Common.numericSeverity": 4
    }
}
```

---

## 5. Supplier risk

### The indicators behind a risk class C supplier

```http
GET /procurement/Suppliers(50000006-0000-4000-8000-000000000006)?$select=name,financialRating_code,onTimeDeliveryRate,qualityIncidents12M,isoCertified,riskScore,riskClass_code
Authorization: Basic (carl)
```

```json
{
    "@odata.context": "$metadata#Suppliers/$entity",
    "name": "Shenzhen Ruiyang Electronics Co.",
    "financialRating_code": "CCC",
    "onTimeDeliveryRate": "0.7000",
    "qualityIncidents12M": 7,
    "isoCertified": false,
    "riskScore": 62,
    "riskClass_code": "C",
    "ID": "50000006-0000-4000-8000-000000000006",
    "riskScoreCriticality": 1
}
```

### Recalculating every supplier (the nightly job entry point)

```http
POST /procurement/recalculateAllSupplierRisks
Authorization: Basic (mona)
Content-Type: application/json

{}
```

```json
{
    "@odata.context": "$metadata#ProcurementService.return_ProcurementService_recalculateAllSupplierRisks",
    "evaluated": 8,
    "changed": 0
}
```

`changed: 0` is the correct answer here, not a bug: the stored scores already
match what the scoring module computes, so the run is idempotent. The
fixture test `test/fixtures.test.ts` enforces exactly this property.

---

## 6. Reporting

### Open commitment per supplier, aggregated in the database

```http
GET /analytics/SupplierRiskExposure
Authorization: Basic (carl)
```

```json
{
    "@odata.context": "$metadata#SupplierRiskExposure",
    "value": [
        {
            "supplierNumber": "4711003",
            "supplierName": "Helvetica Precision SA",
            "riskScore": 2,
            "riskClass": "A",
            "country": "CH",
            "openVolume": "112500.00",
            "itemCount": 1
        },
        {
            "supplierNumber": "4711004",
            "supplierName": "Wisla Components Sp. z o.o.",
            "riskScore": 17,
            "riskClass": "A",
            "country": "PL",
            "openVolume": "21750.00",
            "itemCount": 1
        },
        {
            "supplierNumber": "4711006",
            "supplierName": "Shenzhen Ruiyang Electronics Co.",
            "riskScore": 62,
            "riskClass": "C",
            "country": "CN",
            "openVolume": "27150.00",
            "itemCount": 2
        }
    ]
}
```

### Budget utilisation per cost center

```http
GET /analytics/CostCenterBudget
Authorization: Basic (carl)
```

```json
{
    "@odata.context": "$metadata#CostCenterBudget",
    "value": [
        {
            "costCenterCode": "1000-4711",
            "name": "Production Line A",
            "responsible": "dana",
            "annualBudget": "750000.00",
            "consumedBudget": "412500.00",
            "remainingBudget": "337500.00",
            "currency_code": "EUR"
        },
        {
            "costCenterCode": "1000-4712",
            "name": "R and D Electronics",
            "responsible": "dana",
            "annualBudget": "1200000.00",
            "consumedBudget": "872150.00",
            "remainingBudget": "327850.00",
            "currency_code": "EUR"
        },
        {
            "costCenterCode": "2000-5001",
            "name": "IT Operations",
            "responsible": "carl",
            "annualBudget": "480000.00",
            "consumedBudget": "455000.00",
            "remainingBudget": "25000.00",
            "currency_code": "EUR"
        },
        {
            "costCenterCode": "3000-6100",
            "name": "Facility Management",
            "responsible": "tom",
            "annualBudget": "260000.00",
            "consumedBudget": "90000.00",
            "remainingBudget": "170000.00",
            "currency_code": "EUR"
        }
    ]
```

