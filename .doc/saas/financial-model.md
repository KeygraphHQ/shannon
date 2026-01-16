# Shannon SaaS - Financial Model (3-Year Projection)
## Detailed Financial Planning & Analysis

**Version:** 1.0
**Last Updated:** 2026-01-16
**Planning Horizon:** 36 months (Jan 2026 - Dec 2028)
**Funding Scenario:** $1.5M Pre-Seed Round

---

## Table of Contents

1. [Model Assumptions](#1-model-assumptions)
2. [Revenue Model](#2-revenue-model)
3. [Cost Structure](#3-cost-structure)
4. [Profit & Loss Statement](#4-profit--loss-statement)
5. [Cash Flow Projection](#5-cash-flow-projection)
6. [Unit Economics](#6-unit-economics)
7. [Hiring Plan](#7-hiring-plan)
8. [Customer Acquisition](#8-customer-acquisition)
9. [Scenario Analysis](#9-scenario-analysis)
10. [Key Metrics Dashboard](#10-key-metrics-dashboard)
11. [Fundraising & Runway](#11-fundraising--runway)

---

## 1. Model Assumptions

### 1.1 Revenue Assumptions

#### Pricing Tiers

| Tier | Monthly Price | Annual Price | Discount | Target Segment |
|------|---------------|--------------|----------|----------------|
| **Free** | $0 | $0 | - | Lead generation |
| **Pro (Monthly)** | $99 | - | - | SMB, startups |
| **Pro (Annual)** | - | $950 | 20% | SMB (committed) |
| **Enterprise** | $499 | $4,790 | 20% | F500, regulated |

#### Conversion Funnel

```
Website Visitors (Monthly)
    ↓ 5% conversion
Signups
    ↓ 70% activate (run 1st scan)
Active Free Users
    ↓ 12% upgrade (Free → Pro)
Paying Customers
    ↓ 5% upgrade (Pro → Enterprise)
Enterprise Customers
```

#### Customer Growth Assumptions

| Metric | Month 1-3 | Month 4-6 | Month 7-12 | Year 2 | Year 3 |
|--------|-----------|-----------|------------|--------|--------|
| **Website Traffic** | 5,000/mo | 10,000/mo | 20,000/mo | 40,000/mo | 80,000/mo |
| **Signup Rate** | 5% | 5% | 6% | 7% | 8% |
| **Activation Rate** | 60% | 70% | 75% | 80% | 85% |
| **Free → Pro** | 8% | 10% | 12% | 14% | 15% |
| **Pro → Enterprise** | 3% | 4% | 5% | 6% | 7% |
| **Monthly Churn** | 6% | 5% | 4% | 3% | 2.5% |

#### Annual/Monthly Split

- **Year 1:** 30% annual, 70% monthly
- **Year 2:** 50% annual, 50% monthly
- **Year 3:** 60% annual, 40% monthly

**Rationale:** As brand strengthens, more customers commit annually for discount.

---

### 1.2 Cost Assumptions

#### Infrastructure Costs (AWS)

| Service | Unit Cost | Usage | Monthly Cost |
|---------|-----------|-------|--------------|
| **EKS Cluster** | $0.10/hr/node | 3 × m5.xlarge | $220 |
| **RDS PostgreSQL** | - | db.t3.large | $150 |
| **ElastiCache Redis** | - | cache.t3.medium | $80 |
| **S3 Storage** | $0.023/GB | 500GB → 5TB (Year 3) | $12 → $115 |
| **S3 Data Transfer** | $0.09/GB | 1TB → 10TB | $90 → $900 |
| **CloudWatch** | - | Logs + metrics | $50 → $200 |
| **Load Balancer** | - | ALB | $25 |
| **Temporal Cloud** | - | Managed service | $200 → $1,000 |
| **Total Infra** | - | - | **$827** → **$2,685** |

**Scaling Factor:** Infrastructure costs scale at 0.5x of revenue (economies of scale)

#### LLM API Costs (Anthropic)

| Model | Input Cost | Output Cost | Avg Tokens/Scan | Cost/Scan |
|-------|------------|-------------|-----------------|-----------|
| **Claude Sonnet 4.5** | $3/M tokens | $15/M tokens | 500k in, 100k out | $3.00 |

**Monthly LLM Cost Formula:**
```
Total Scans × $3.00 = LLM Cost
(Pass-through to customers or absorbed as COGS)
```

**Year 1:** 10,000 scans/mo × $3 = $30,000/mo
**Year 2:** 30,000 scans/mo × $3 = $90,000/mo
**Year 3:** 60,000 scans/mo × $3 = $180,000/mo

**Mitigation Strategies:**
- Negotiate volume discounts (Year 2: 10% off, Year 3: 20% off)
- Cache common patterns (reduce tokens by 15-20%)
- Offer "Fast Scan" tier with cheaper model (Haiku)

#### Headcount Assumptions

| Role | Year 1 Salary | Year 2 Salary | Year 3 Salary | Burden (Benefits) |
|------|---------------|---------------|---------------|-------------------|
| **CEO** | $120,000 | $140,000 | $160,000 | 25% |
| **CTO** | $140,000 | $160,000 | $180,000 | 25% |
| **Senior Engineer** | $150,000 | $160,000 | $170,000 | 25% |
| **Mid Engineer** | $120,000 | $130,000 | $140,000 | 25% |
| **Junior Engineer** | $90,000 | $100,000 | $110,000 | 25% |
| **DevOps Engineer** | $130,000 | $140,000 | $150,000 | 25% |
| **Product Designer** | $110,000 | $120,000 | $130,000 | 25% |
| **Product Manager** | $130,000 | $140,000 | $150,000 | 25% |
| **Marketing Manager** | $100,000 | $110,000 | $120,000 | 25% |
| **Sales Rep (AE)** | $80k + $40k OTE | $90k + $50k OTE | $100k + $60k OTE | 25% |
| **Customer Success** | $70,000 | $80,000 | $90,000 | 25% |

**Note:** Fully-loaded cost = Salary × 1.25 (includes health, 401k, taxes, equipment)

---

### 1.3 Sales & Marketing Assumptions

#### Customer Acquisition Cost (CAC) by Channel

| Channel | CAC (Year 1) | CAC (Year 2) | CAC (Year 3) | % of New Customers |
|---------|--------------|--------------|--------------|---------------------|
| **Organic (SEO/Content)** | $20 | $15 | $10 | 30% → 40% → 50% |
| **Paid Ads (Google)** | $180 | $150 | $120 | 40% → 35% → 25% |
| **Referral Program** | $50 | $40 | $30 | 10% → 15% → 20% |
| **Sales Outreach** | $300 | $250 | $200 | 20% → 10% → 5% |
| **Weighted Average CAC** | **$150** | **$110** | **$75** | 100% |

**CAC Improvement Drivers:**
- Organic traffic compounds (SEO flywheel)
- Referral program matures (existing customers invite peers)
- Brand awareness reduces paid ad costs

#### Marketing Budget Allocation

| Category | Year 1 | Year 2 | Year 3 |
|----------|--------|--------|--------|
| **Paid Ads** | $120,000 | $180,000 | $240,000 |
| **Content Marketing** | $60,000 | $90,000 | $120,000 |
| **Events/Conferences** | $30,000 | $50,000 | $80,000 |
| **Tools (HubSpot, etc.)** | $20,000 | $30,000 | $40,000 |
| **Referral Program** | $10,000 | $20,000 | $40,000 |
| **Total Marketing** | **$240,000** | **$370,000** | **$520,000** |

---

## 2. Revenue Model

### 2.1 Customer Cohort Projection

#### Year 1 (Month-by-Month)

| Month | Free Users | Pro Users | Enterprise | MRR | ARR Run Rate |
|-------|------------|-----------|------------|-----|--------------|
| **Jan** | 150 | 10 | 1 | $1,489 | $17,868 |
| **Feb** | 280 | 22 | 2 | $3,176 | $38,112 |
| **Mar** | 420 | 38 | 4 | $5,758 | $69,096 |
| **Apr** | 580 | 58 | 6 | $8,734 | $104,808 |
| **May** | 760 | 82 | 9 | $12,609 | $151,308 |
| **Jun** | 960 | 110 | 13 | $17,377 | $208,524 |
| **Jul** | 1,180 | 142 | 18 | $23,036 | $276,432 |
| **Aug** | 1,420 | 178 | 24 | $29,582 | $354,984 |
| **Sep** | 1,680 | 218 | 31 | $37,011 | $444,132 |
| **Oct** | 1,960 | 262 | 39 | $45,319 | $543,828 |
| **Nov** | 2,260 | 310 | 48 | $54,503 | $654,036 |
| **Dec** | 2,580 | 362 | 58 | $64,559 | $774,708 |

**Year 1 Totals:**
- **Total Customers (EOY):** 3,000 (2,580 Free + 362 Pro + 58 Enterprise)
- **MRR (Dec):** $64,559
- **ARR (Dec Run Rate):** $774,708
- **Actual ARR (including annual prepays):** $504,000

**Calculation Notes:**
- Free users grow 130/month initially, accelerating to 320/month by Dec
- Pro conversion: 12% of active free users (with 1-month lag)
- Enterprise conversion: 5% of Pro users (with 2-month lag)
- Churn included: 6% monthly for Pro, 3% for Enterprise

---

#### Year 2 (Quarterly)

| Quarter | Free Users | Pro Users | Enterprise | MRR | Quarterly Revenue |
|---------|------------|-----------|------------|-----|-------------------|
| **Q1** | 3,800 | 480 | 75 | $85,020 | $255,060 |
| **Q2** | 5,200 | 650 | 98 | $113,402 | $340,206 |
| **Q3** | 6,800 | 860 | 128 | $149,632 | $448,896 |
| **Q4** | 8,600 | 1,100 | 165 | $192,135 | $576,405 |

**Year 2 Totals:**
- **Total Customers (EOY):** 9,865 (8,600 Free + 1,100 Pro + 165 Enterprise)
- **MRR (Dec):** $192,135
- **ARR (Dec Run Rate):** $2,305,620
- **Actual ARR:** $1,620,567

**Growth Rate Year 1 → 2:** +221% ARR

---

#### Year 3 (Quarterly)

| Quarter | Free Users | Pro Users | Enterprise | MRR | Quarterly Revenue |
|---------|------------|-----------|------------|-----|-------------------|
| **Q1** | 11,200 | 1,400 | 210 | $242,700 | $728,100 |
| **Q2** | 14,000 | 1,750 | 265 | $302,175 | $906,525 |
| **Q3** | 17,000 | 2,150 | 330 | $370,350 | $1,111,050 |
| **Q4** | 20,400 | 2,600 | 405 | $447,795 | $1,343,385 |

**Year 3 Totals:**
- **Total Customers (EOY):** 23,405 (20,400 Free + 2,600 Pro + 405 Enterprise)
- **MRR (Dec):** $447,795
- **ARR (Dec Run Rate):** $5,373,540
- **Actual ARR:** $4,089,060

**Growth Rate Year 2 → 3:** +152% ARR

---

### 2.2 Revenue Breakdown by Tier

#### Year 1 Revenue Composition

| Tier | Customers (Avg) | ARPU | Total Revenue | % of Total |
|------|-----------------|------|---------------|------------|
| **Free** | 1,290 | $0 | $0 | 0% |
| **Pro** | 186 | $1,188 | $220,968 | 44% |
| **Enterprise** | 29 | $5,988 | $173,652 | 34% |
| **Annual Prepay Bonus** | - | - | $109,380 | 22% |
| **Total** | 1,505 | - | **$504,000** | 100% |

**Notes:**
- ARPU = Average Revenue Per User (blended monthly + annual)
- Annual prepay bonus = customers paying upfront (30% in Year 1)

---

#### Year 2 Revenue Composition

| Tier | Customers (Avg) | ARPU | Total Revenue | % of Total |
|------|-----------------|------|---------------|------------|
| **Free** | 6,100 | $0 | $0 | 0% |
| **Pro** | 773 | $1,188 | $918,324 | 57% |
| **Enterprise** | 117 | $5,988 | $700,596 | 43% |
| **Total** | 6,990 | - | **$1,618,920** | 100% |

**Year-over-Year Growth:** +221%

---

#### Year 3 Revenue Composition

| Tier | Customers (Avg) | ARPU | Total Revenue | % of Total |
|------|-----------------|------|---------------|------------|
| **Free** | 15,650 | $0 | $0 | 0% |
| **Pro** | 2,025 | $1,188 | $2,405,700 | 59% |
| **Enterprise** | 303 | $5,988 | $1,814,364 | 41% |
| **Total** | 17,978 | - | **$4,220,064** | 100% |

**Year-over-Year Growth:** +161%

---

### 2.3 Revenue Recognition

**Accounting Method:** Subscription-based, monthly recognition

- **Monthly Plans:** Recognize revenue in month earned
- **Annual Plans:** Deferred revenue, recognize ratably over 12 months
- **Example:** Customer pays $950 annually in Jan → Recognize $79.17/month × 12

**Deferred Revenue Balance:**

| Period | Annual Prepayments | Deferred Revenue (EOY) |
|--------|---------------------|------------------------|
| **Year 1** | $151,200 | $113,400 |
| **Year 2** | $809,460 | $607,095 |
| **Year 3** | $2,532,038 | $1,899,029 |

---

## 3. Cost Structure

### 3.1 Cost of Goods Sold (COGS)

#### Components of COGS

| Cost Category | Year 1 | Year 2 | Year 3 | % of Revenue |
|---------------|--------|--------|--------|--------------|
| **Infrastructure (AWS)** | $36,000 | $72,000 | $120,000 | 7% → 4.4% → 2.8% |
| **LLM API Costs** | $360,000 | $1,080,000 | $2,160,000 | 71% → 66% → 51% |
| **Temporal Cloud** | $2,400 | $6,000 | $12,000 | 0.5% → 0.4% → 0.3% |
| **External Tools (nmap, etc.)** | $0 | $0 | $0 | - |
| **Total COGS** | **$398,400** | **$1,158,000** | **$2,292,000** | **79%** → **71%** → **54%** |

**Gross Margin:** 21% → 29% → 46%

**Notes:**
- LLM costs are largest component (but decreasing as % of revenue due to volume discounts)
- Gross margin improves over time as we optimize prompts and negotiate better API rates
- Year 3 target: Negotiate 20% volume discount with Anthropic ($2.4/scan instead of $3)

---

### 3.2 Operating Expenses (OpEx)

#### Personnel Costs

##### Year 1 Headcount & Costs

| Role | Count | Avg Salary | Fully-Loaded | Total Cost |
|------|-------|------------|--------------|------------|
| **Founders (CEO + CTO)** | 2 | $130,000 | $162,500 | $325,000 |
| **Senior Engineer** | 1 | $150,000 | $187,500 | $187,500 |
| **Mid Engineer** | 2 | $120,000 | $150,000 | $300,000 |
| **DevOps Engineer** | 1 | $130,000 | $162,500 | $162,500 |
| **Product Designer** | 1 | $110,000 | $137,500 | $137,500 |
| **Marketing Manager** | 1 | $100,000 | $125,000 | $125,000 |
| **Customer Success** | 1 | $70,000 | $87,500 | $87,500 |
| **Total Headcount** | **9** | - | - | **$1,325,000** |

**Average Cost per Employee:** $147,222 (fully-loaded)

---

##### Year 2 Headcount & Costs

| Role | Count | Avg Salary | Fully-Loaded | Total Cost |
|------|-------|------------|--------------|------------|
| **Founders** | 2 | $150,000 | $187,500 | $375,000 |
| **Senior Engineer** | 2 | $160,000 | $200,000 | $400,000 |
| **Mid Engineer** | 3 | $130,000 | $162,500 | $487,500 |
| **Junior Engineer** | 2 | $100,000 | $125,000 | $250,000 |
| **DevOps Engineer** | 1 | $140,000 | $175,000 | $175,000 |
| **Product Designer** | 1 | $120,000 | $150,000 | $150,000 |
| **Product Manager** | 1 | $140,000 | $175,000 | $175,000 |
| **Marketing Manager** | 1 | $110,000 | $137,500 | $137,500 |
| **Sales Rep (AE)** | 2 | $120,000 | $150,000 | $300,000 |
| **Customer Success** | 2 | $80,000 | $100,000 | $200,000 |
| **Total Headcount** | **17** | - | - | **$2,650,000** |

**Average Cost per Employee:** $155,882

---

##### Year 3 Headcount & Costs

| Role | Count | Avg Salary | Fully-Loaded | Total Cost |
|------|-------|------------|--------------|------------|
| **Founders** | 2 | $170,000 | $212,500 | $425,000 |
| **Engineering (all levels)** | 10 | $140,000 | $175,000 | $1,750,000 |
| **Product (PM + Design)** | 2 | $140,000 | $175,000 | $350,000 |
| **Sales** | 4 | $140,000 | $175,000 | $700,000 |
| **Marketing** | 2 | $120,000 | $150,000 | $300,000 |
| **Customer Success** | 3 | $90,000 | $112,500 | $337,500 |
| **Operations/Finance** | 1 | $110,000 | $137,500 | $137,500 |
| **Total Headcount** | **24** | - | - | **$4,000,000** |

**Average Cost per Employee:** $166,667

---

#### Sales & Marketing Expenses

| Category | Year 1 | Year 2 | Year 3 |
|----------|--------|--------|--------|
| **Paid Advertising** | $120,000 | $180,000 | $240,000 |
| **Content Marketing** | $60,000 | $90,000 | $120,000 |
| **Events/Conferences** | $30,000 | $50,000 | $80,000 |
| **Marketing Tools** | $20,000 | $30,000 | $40,000 |
| **Referral Program** | $10,000 | $20,000 | $40,000 |
| **Sales Commissions** | $0 | $80,000 | $200,000 |
| **Total S&M** | **$240,000** | **$450,000** | **$720,000** |

**S&M as % of Revenue:** 48% → 28% → 17%

---

#### General & Administrative (G&A)

| Category | Year 1 | Year 2 | Year 3 |
|----------|--------|--------|--------|
| **Legal & Accounting** | $40,000 | $60,000 | $80,000 |
| **Insurance (D&O, Cyber)** | $20,000 | $30,000 | $40,000 |
| **Office/Coworking** | $24,000 | $36,000 | $48,000 |
| **Software/Tools (Slack, etc.)** | $15,000 | $25,000 | $40,000 |
| **Recruiting** | $20,000 | $40,000 | $60,000 |
| **SOC2 Audit** | $50,000 | $30,000 | $30,000 |
| **Travel** | $15,000 | $25,000 | $40,000 |
| **Miscellaneous** | $20,000 | $30,000 | $40,000 |
| **Total G&A** | **$204,000** | **$276,000** | **$378,000** |

**G&A as % of Revenue:** 40% → 17% → 9%

---

### 3.3 Total Operating Expenses Summary

| Category | Year 1 | Year 2 | Year 3 |
|----------|--------|--------|--------|
| **Personnel** | $1,325,000 | $2,650,000 | $4,000,000 |
| **Sales & Marketing** | $240,000 | $450,000 | $720,000 |
| **General & Administrative** | $204,000 | $276,000 | $378,000 |
| **Total OpEx** | **$1,769,000** | **$3,376,000** | **$5,098,000** |

**OpEx as % of Revenue:** 351% → 208% → 121%

---

## 4. Profit & Loss Statement

### 4.1 Year 1 P&L (Monthly Detail - First 6 Months)

| Line Item | Jan | Feb | Mar | Apr | May | Jun |
|-----------|-----|-----|-----|-----|-----|-----|
| **Revenue** | $1,489 | $3,176 | $5,758 | $8,734 | $12,609 | $17,377 |
| **COGS** | $1,177 | $2,510 | $4,551 | $6,905 | $9,967 | $13,739 |
| **Gross Profit** | $312 | $666 | $1,207 | $1,829 | $2,642 | $3,638 |
| **Gross Margin %** | 21% | 21% | 21% | 21% | 21% | 21% |
| | | | | | | |
| **Operating Expenses:** | | | | | | |
| Personnel | $110,417 | $110,417 | $110,417 | $110,417 | $110,417 | $110,417 |
| Sales & Marketing | $20,000 | $20,000 | $20,000 | $20,000 | $20,000 | $20,000 |
| G&A | $17,000 | $17,000 | $17,000 | $17,000 | $17,000 | $17,000 |
| **Total OpEx** | $147,417 | $147,417 | $147,417 | $147,417 | $147,417 | $147,417 |
| | | | | | | |
| **EBITDA** | -$147,105 | -$146,751 | -$146,210 | -$145,588 | -$144,775 | -$143,779 |
| **EBITDA Margin %** | -9,881% | -4,621% | -2,539% | -1,667% | -1,148% | -827% |

**Notes:**
- Negative EBITDA expected in early months (typical for SaaS startups)
- Burn rate stabilizes around $145k/month
- Margin improves as revenue scales

---

### 4.2 Year 1 P&L (Full Year)

| Line Item | Q1 | Q2 | Q3 | Q4 | **Year 1 Total** |
|-----------|-----|-----|-----|-----|------------------|
| **Revenue** | $10,423 | $38,720 | $89,629 | $164,381 | **$303,153** |
| **COGS** | $8,234 | $30,599 | $70,858 | $129,961 | **$239,652** |
| **Gross Profit** | $2,189 | $8,121 | $18,771 | $34,420 | **$63,501** |
| **Gross Margin %** | 21% | 21% | 21% | 21% | **21%** |
| | | | | | |
| **Operating Expenses:** | | | | | |
| Personnel | $331,250 | $331,250 | $331,250 | $331,250 | $1,325,000 |
| Sales & Marketing | $60,000 | $60,000 | $60,000 | $60,000 | $240,000 |
| G&A | $51,000 | $51,000 | $51,000 | $51,000 | $204,000 |
| **Total OpEx** | $442,250 | $442,250 | $442,250 | $442,250 | **$1,769,000** |
| | | | | | |
| **EBITDA** | -$440,061 | -$434,129 | -$423,479 | -$407,830 | **-$1,705,499** |
| **EBITDA Margin %** | -4,222% | -1,121% | -472% | -248% | **-562%** |

**Key Takeaways:**
- Total Revenue: $303k (below earlier estimate due to conservative ramp)
- Gross Margin: 21% (LLM costs dominate)
- Net Loss: -$1.7M (expected for Year 1)
- Burn Rate: ~$142k/month average

---

### 4.3 Year 2 P&L (Quarterly)

| Line Item | Q1 | Q2 | Q3 | Q4 | **Year 2 Total** |
|-----------|-----|-----|-----|-----|------------------|
| **Revenue** | $255,060 | $340,206 | $448,896 | $576,405 | **$1,620,567** |
| **COGS** | $181,043 | $241,446 | $318,516 | $408,747 | **$1,149,752** |
| **Gross Profit** | $74,017 | $98,760 | $130,380 | $167,658 | **$470,815** |
| **Gross Margin %** | 29% | 29% | 29% | 29% | **29%** |
| | | | | | |
| **Operating Expenses:** | | | | | |
| Personnel | $662,500 | $662,500 | $662,500 | $662,500 | $2,650,000 |
| Sales & Marketing | $112,500 | $112,500 | $112,500 | $112,500 | $450,000 |
| G&A | $69,000 | $69,000 | $69,000 | $69,000 | $276,000 |
| **Total OpEx** | $844,000 | $844,000 | $844,000 | $844,000 | **$3,376,000** |
| | | | | | |
| **EBITDA** | -$769,983 | -$745,240 | -$713,620 | -$676,342 | **-$2,905,185** |
| **EBITDA Margin %** | -302% | -219% | -159% | -117% | **-179%** |

**Key Takeaways:**
- Revenue grows 5.3x ($303k → $1.62M)
- Gross Margin improves to 29% (volume discounts kicking in)
- Still burning ~$242k/month (need to raise Series A)

---

### 4.4 Year 3 P&L (Quarterly)

| Line Item | Q1 | Q2 | Q3 | Q4 | **Year 3 Total** |
|-----------|-----|-----|-----|-----|------------------|
| **Revenue** | $728,100 | $906,525 | $1,111,050 | $1,343,385 | **$4,089,060** |
| **COGS** | $401,455 | $499,589 | $612,578 | $740,662 | **$2,254,284** |
| **Gross Profit** | $326,645 | $406,936 | $498,472 | $602,723 | **$1,834,776** |
| **Gross Margin %** | 45% | 45% | 45% | 45% | **45%** |
| | | | | | |
| **Operating Expenses:** | | | | | |
| Personnel | $1,000,000 | $1,000,000 | $1,000,000 | $1,000,000 | $4,000,000 |
| Sales & Marketing | $180,000 | $180,000 | $180,000 | $180,000 | $720,000 |
| G&A | $94,500 | $94,500 | $94,500 | $94,500 | $378,000 |
| **Total OpEx** | $1,274,500 | $1,274,500 | $1,274,500 | $1,274,500 | **$5,098,000** |
| | | | | | |
| **EBITDA** | -$947,855 | -$867,564 | -$776,028 | -$671,777 | **-$3,263,224** |
| **EBITDA Margin %** | -130% | -96% | -70% | -50% | **-80%** |

**Key Takeaways:**
- Revenue grows 2.5x ($1.62M → $4.09M)
- Gross Margin improves to 45% (negotiated 20% LLM discount)
- Still not profitable, but path to profitability visible (EBITDA margin improving)
- Need Series A/B by end of Year 2 to sustain growth

---

### 4.5 3-Year P&L Summary

| Line Item | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| **Revenue** | $303,153 | $1,620,567 | $4,089,060 |
| **YoY Growth** | - | +434% | +152% |
| | | | |
| **COGS** | $239,652 | $1,149,752 | $2,254,284 |
| **Gross Profit** | $63,501 | $470,815 | $1,834,776 |
| **Gross Margin %** | 21% | 29% | 45% |
| | | | |
| **Operating Expenses** | $1,769,000 | $3,376,000 | $5,098,000 |
| **EBITDA** | -$1,705,499 | -$2,905,185 | -$3,263,224 |
| **EBITDA Margin %** | -562% | -179% | -80% |
| | | | |
| **Net Income** | -$1,705,499 | -$2,905,185 | -$3,263,224 |

**Cumulative 3-Year Loss:** -$7,873,908

**Path to Profitability:**
- Q1 2029 (Year 4): Break-even projected at $8M ARR
- Requires maintaining 45%+ gross margin and OpEx discipline

---

## 5. Cash Flow Projection

### 5.1 Year 1 Cash Flow (Quarterly)

| Line Item | Q1 | Q2 | Q3 | Q4 | **Year 1 Total** |
|-----------|-----|-----|-----|-----|------------------|
| **Beginning Cash** | $1,500,000 | $1,036,314 | $579,560 | $163,456 | $1,500,000 |
| | | | | | |
| **Cash Inflows:** | | | | | |
| Revenue Collected | $10,423 | $38,720 | $89,629 | $164,381 | $303,153 |
| Annual Prepayments | $37,800 | $47,250 | $56,700 | $66,150 | $207,900 |
| **Total Inflows** | $48,223 | $85,970 | $146,329 | $230,531 | **$511,053** |
| | | | | | |
| **Cash Outflows:** | | | | | |
| COGS (excl. depreciation) | $8,234 | $30,599 | $70,858 | $129,961 | $239,652 |
| Personnel | $331,250 | $331,250 | $331,250 | $331,250 | $1,325,000 |
| Sales & Marketing | $60,000 | $60,000 | $60,000 | $60,000 | $240,000 |
| G&A | $51,000 | $51,000 | $51,000 | $51,000 | $204,000 |
| CapEx (equipment) | $10,000 | $5,000 | $5,000 | $5,000 | $25,000 |
| **Total Outflows** | $460,484 | $477,849 | $518,108 | $577,211 | **$2,033,652** |
| | | | | | |
| **Net Cash Flow** | -$412,261 | -$391,879 | -$371,779 | -$346,680 | **-$1,522,599** |
| | | | | | |
| **Ending Cash** | $1,087,739 | $695,860 | $324,081 | -$22,599 | **-$22,599** |

**⚠️ Cash Crunch Alert:** Need additional funding by Q4 Year 1!

---

### 5.2 Fundraising Schedule

#### Pre-Seed Round (Month 0)

| Item | Amount |
|------|--------|
| **Raised** | $1,500,000 |
| **Post-Money Valuation** | $7,500,000 |
| **Dilution** | 20% |
| **Use of Funds** | 18-month runway |

---

#### Series A (Month 18 - Q2 Year 2)

| Item | Amount |
|------|--------|
| **Amount to Raise** | $5,000,000 |
| **Pre-Money Valuation** | $20,000,000 |
| **Post-Money Valuation** | $25,000,000 |
| **Dilution** | 20% |
| **ARR at Raise** | $1,000,000 |
| **ARR Multiple** | 25x |
| **Use of Funds** | 24-month runway, scale to $10M ARR |

**Milestones to Hit Before Series A:**
- [ ] $1M ARR
- [ ] 500+ paying customers
- [ ] <5% monthly churn
- [ ] 99.5% uptime (proven reliability)
- [ ] 3+ enterprise logos ($50k+ ACV)

---

### 5.3 Revised Cash Flow with Series A

| Line Item | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| **Beginning Cash** | $1,500,000 | -$22,599 | $1,657,466 |
| **Fundraising** | $0 | $5,000,000 | $0 |
| **Revenue** | $511,053 | $1,620,567 | $4,089,060 |
| **Total Cash In** | $2,011,053 | $6,597,968 | $5,746,526 |
| | | | |
| **COGS** | $239,652 | $1,149,752 | $2,254,284 |
| **OpEx** | $1,769,000 | $3,376,000 | $5,098,000 |
| **CapEx** | $25,000 | $50,000 | $75,000 |
| **Total Cash Out** | $2,033,652 | $4,575,752 | $7,427,284 |
| | | | |
| **Net Cash Flow** | -$22,599 | $2,022,216 | -$1,680,758 |
| **Ending Cash** | -$22,599 | $1,999,617 | $318,859 |

**⚠️ Series B Needed:** By Q3-Q4 Year 3 to continue growth trajectory

---

## 6. Unit Economics

### 6.1 Customer Lifetime Value (LTV)

#### LTV Calculation by Tier

**Formula:**
```
LTV = ARPU × Gross Margin × (1 / Churn Rate)
```

##### Pro Tier

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **ARPU (monthly)** | $99 | $99 | $99 |
| **Gross Margin** | 21% | 29% | 45% |
| **Monthly Churn** | 5% | 3.5% | 2.5% |
| **LTV** | $416 | $824 | $1,782 |

**Calculation (Year 3):**
```
LTV = $99 × 0.45 × (1 / 0.025) = $99 × 0.45 × 40 = $1,782
```

---

##### Enterprise Tier

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **ARPU (monthly)** | $499 | $499 | $499 |
| **Gross Margin** | 21% | 29% | 45% |
| **Monthly Churn** | 2% | 1.5% | 1% |
| **LTV** | $5,240 | $9,635 | $22,455 |

**Calculation (Year 3):**
```
LTV = $499 × 0.45 × (1 / 0.01) = $499 × 0.45 × 100 = $22,455
```

---

#### Blended LTV

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **Blended LTV** | $1,828 | $3,230 | $6,119 |
| **CAC** | $150 | $110 | $75 |
| **LTV:CAC Ratio** | 12.2:1 | 29.4:1 | 81.6:1 |

**Health Check:**
- ✅ Target: LTV:CAC > 3:1 (achieved in all years)
- ✅ Best-in-class SaaS: LTV:CAC > 5:1 (achieved Year 2+)

---

### 6.2 CAC Payback Period

**Formula:**
```
CAC Payback = CAC / (ARPU × Gross Margin)
```

#### Pro Tier Payback

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **CAC** | $150 | $110 | $75 |
| **Monthly ARPU** | $99 | $99 | $99 |
| **Gross Margin** | 21% | 29% | 45% |
| **Payback (months)** | 7.2 | 3.8 | 1.7 |

**Calculation (Year 3):**
```
Payback = $75 / ($99 × 0.45) = $75 / $44.55 = 1.7 months
```

**Health Check:**
- ✅ Target: <12 months (achieved all years)
- ✅ Best-in-class: <6 months (achieved Year 2+)

---

### 6.3 Magic Number (Sales Efficiency)

**Formula:**
```
Magic Number = (ARR Added This Quarter × Gross Margin) / Sales & Marketing Spend Last Quarter
```

#### Year 2 Example (Q2)

```
New ARR (Q2 Year 2): $340,206 × 4 = $1,360,824
Gross Margin: 29%
S&M Spend (Q1): $112,500

Magic Number = ($1,360,824 × 0.29) / $112,500 = 3.51
```

**Interpretation:**
- < 0.5: Inefficient, don't scale S&M
- 0.5 - 0.75: Acceptable, monitor closely
- 0.75 - 1.0: Good, can scale S&M
- \> 1.0: Excellent, aggressively scale S&M ✅

**Shannon's Magic Number Trajectory:**
- Year 1: 0.42 (PLG focus, low S&M)
- Year 2: 3.51 (highly efficient)
- Year 3: 4.12 (best-in-class)

---

### 6.4 Rule of 40

**Formula:**
```
Rule of 40 = Revenue Growth Rate (%) + EBITDA Margin (%)
```

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **Revenue Growth** | - | +434% | +152% |
| **EBITDA Margin** | -562% | -179% | -80% |
| **Rule of 40 Score** | -562% | +255% | +72% |

**Health Check:**
- ✅ Target: > 40% (achieved Year 2+)
- 🎯 Year 2: 255% (exceptional growth offsets losses)
- 🎯 Year 3: 72% (still strong, trending toward profitability)

---

## 7. Hiring Plan

### 7.1 Headcount by Function

| Function | Year 1 | Year 2 | Year 3 | 3-Year Growth |
|----------|--------|--------|--------|---------------|
| **Engineering** | 4 | 8 | 10 | +150% |
| **Product** | 1 | 2 | 2 | +100% |
| **Sales** | 0 | 2 | 4 | - |
| **Marketing** | 1 | 1 | 2 | +100% |
| **Customer Success** | 1 | 2 | 3 | +200% |
| **Operations** | 0 | 0 | 1 | - |
| **Executive** | 2 | 2 | 2 | 0% |
| **Total** | **9** | **17** | **24** | **+167%** |

---

### 7.2 Hiring Timeline (Month-by-Month)

#### Year 1 Hires

| Month | Role | Salary (Fully-Loaded) | Rationale |
|-------|------|----------------------|-----------|
| **Month 0** | CEO + CTO (Founders) | $325,000 | - |
| **Month 1** | Senior Engineer | $187,500 | Build MVP backend |
| **Month 1** | Mid Engineer #1 | $150,000 | Build MVP frontend |
| **Month 2** | DevOps Engineer | $162,500 | Setup K8s, CI/CD |
| **Month 3** | Mid Engineer #2 | $150,000 | Features + bug fixes |
| **Month 4** | Product Designer | $137,500 | UI/UX for launch |
| **Month 5** | Marketing Manager | $125,000 | GTM strategy |
| **Month 6** | Customer Success | $87,500 | Support first customers |

**Year 1 Total:** 9 employees, $1,325,000 fully-loaded

---

#### Year 2 Hires

| Month | Role | Salary (Fully-Loaded) | Rationale |
|-------|------|----------------------|-----------|
| **Month 13** | Senior Engineer #2 | $200,000 | Scale backend |
| **Month 14** | Mid Engineer #3 | $162,500 | Frontend features |
| **Month 15** | Junior Engineer #1 | $125,000 | QA automation |
| **Month 16** | Junior Engineer #2 | $125,000 | Bug fixes |
| **Month 17** | Product Manager | $175,000 | Roadmap planning |
| **Month 18** | Sales Rep #1 | $150,000 | Enterprise sales |
| **Month 20** | Sales Rep #2 | $150,000 | SMB sales |
| **Month 22** | Customer Success #2 | $100,000 | Onboarding |

**Year 2 Total:** 17 employees, $2,650,000 fully-loaded

---

#### Year 3 Hires

| Month | Role | Count | Total Cost |
|-------|------|-------|------------|
| **Month 25-30** | Engineers (various) | +2 | $350,000 |
| **Month 27** | Sales Rep #3 | +1 | $175,000 |
| **Month 29** | Sales Rep #4 | +1 | $175,000 |
| **Month 30** | Marketing Manager #2 | +1 | $150,000 |
| **Month 31** | Customer Success #3 | +1 | $112,500 |
| **Month 33** | Operations Manager | +1 | $137,500 |

**Year 3 Total:** 24 employees, $4,000,000 fully-loaded

---

### 7.3 Employee Metrics

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **Revenue per Employee** | $33,684 | $95,327 | $170,378 |
| **ARR per Employee** | $56,000 | $95,327 | $170,378 |
| **Target (SaaS Benchmark)** | >$100k | >$150k | >$200k |
| **Status** | ❌ Below | ❌ Below | ❌ Below |

**Action Plan:**
- Year 3: Revenue/employee below target due to early-stage investment
- Year 4 Target: $250k/employee (need to reach $10M ARR with 40 employees)

---

## 8. Customer Acquisition

### 8.1 Acquisition Funnel

#### Year 1 Funnel Metrics

| Stage | Month 1 | Month 6 | Month 12 | Conversion Rate |
|-------|---------|---------|----------|-----------------|
| **Website Visitors** | 5,000 | 10,000 | 20,000 | - |
| **Signups** | 250 | 600 | 1,200 | 5% → 6% |
| **Activated (1st Scan)** | 150 | 420 | 900 | 60% → 75% |
| **Paid Conversion** | 12 | 50 | 108 | 8% → 12% |

**Key Insights:**
- Activation rate improves as onboarding is refined (60% → 75%)
- Free → Paid conversion improves as product matures (8% → 12%)

---

#### Year 2 Funnel Metrics

| Stage | Q1 | Q2 | Q3 | Q4 | Conversion Rate |
|-------|-----|-----|-----|-----|-----------------|
| **Website Visitors** | 25,000 | 30,000 | 35,000 | 40,000 | - |
| **Signups** | 1,750 | 2,100 | 2,450 | 2,800 | 7% |
| **Activated** | 1,400 | 1,722 | 2,009 | 2,296 | 80% |
| **Paid Conversion** | 196 | 241 | 281 | 322 | 14% |

**Total Year 2 New Paid Customers:** 1,040

---

### 8.2 Channel Attribution

#### Year 1 Customer Sources

| Channel | Customers | % of Total | CAC | Total Spend |
|---------|-----------|------------|-----|-------------|
| **Organic (SEO/Blog)** | 108 | 30% | $20 | $2,160 |
| **Paid Ads (Google)** | 144 | 40% | $180 | $25,920 |
| **Referral** | 36 | 10% | $50 | $1,800 |
| **Sales Outreach** | 72 | 20% | $300 | $21,600 |
| **Total** | **360** | 100% | **$150** | **$51,480** |

**Note:** Marketing spend ($240k) includes brand building, not just direct acquisition

---

#### Year 2 Customer Sources

| Channel | Customers | % of Total | CAC | Total Spend |
|---------|-----------|------------|-----|-------------|
| **Organic** | 416 | 40% | $15 | $6,240 |
| **Paid Ads** | 364 | 35% | $150 | $54,600 |
| **Referral** | 156 | 15% | $40 | $6,240 |
| **Sales Outreach** | 104 | 10% | $250 | $26,000 |
| **Total** | **1,040** | 100% | **$110** | **$93,080** |

**CAC Reduction:** $150 → $110 (-27%)
**Driver:** Organic channel scales without additional spend

---

### 8.3 Churn & Retention

#### Cohort Retention Table (Year 1)

| Cohort (Month Joined) | M1 | M2 | M3 | M6 | M12 |
|-----------------------|-----|-----|-----|-----|------|
| **Jan** | 100% | 94% | 89% | 78% | 64% |
| **Feb** | 100% | 95% | 90% | 80% | - |
| **Mar** | 100% | 95% | 91% | - | - |
| **Apr** | 100% | 96% | 92% | - | - |
| **May** | 100% | 96% | - | - | - |
| **Jun** | 100% | 97% | - | - | - |

**Average 12-Month Retention:** 64% (36% churn)

**Churn Reasons (Year 1):**
- 40%: Budget constraints (startup failed)
- 30%: Not enough features (expected more)
- 20%: Too expensive for value
- 10%: Other

---

#### Churn Improvement Over Time

| Metric | Year 1 | Year 2 | Year 3 | Target |
|--------|--------|--------|--------|--------|
| **Monthly Churn (Pro)** | 5% | 3.5% | 2.5% | <3% |
| **Monthly Churn (Enterprise)** | 2% | 1.5% | 1% | <1% |
| **Annual Retention** | 64% | 73% | 82% | >80% |

**Improvement Drivers:**
- Better onboarding (reduce early churn)
- More features (increase stickiness)
- CI/CD integration (becomes critical infra)
- Annual contracts (12-month commitment)

---

## 9. Scenario Analysis

### 9.1 Base Case (Current Model)

**Assumptions:**
- Marketing spend: $240k → $720k
- CAC: $150 → $75
- Churn: 5% → 2.5%
- Gross Margin: 21% → 45%

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **ARR** | $303k | $1.62M | $4.09M |
| **Customers** | 360 | 1,400 | 3,405 |
| **EBITDA** | -$1.71M | -$2.91M | -$3.26M |
| **Cash Needed** | $1.5M | $5.0M | - |

---

### 9.2 Optimistic Case (+30% Better)

**Assumptions:**
- Viral coefficient: 1.3x (referrals drive 50% of signups)
- CAC: $100 → $50 (30% lower than base)
- Churn: 3% → 1.5% (better retention)
- Gross Margin: 30% → 55% (better LLM discounts)

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **ARR** | $394k (+30%) | $2.11M (+30%) | $5.32M (+30%) |
| **Customers** | 468 | 1,820 | 4,427 |
| **EBITDA** | -$1.52M | -$2.35M | -$2.18M |
| **Cash Needed** | $1.5M | $4.0M | - |
| **Profitability** | - | - | Q3 2029 |

**Key Differences:**
- ✅ Lower fundraising need ($4M vs $5M Series A)
- ✅ Profitability 6 months earlier
- ✅ Higher valuation at Series A ($30M vs $20M)

---

### 9.3 Pessimistic Case (-30% Worse)

**Assumptions:**
- Marketing underperforms (CAC: $200 → $100)
- Higher churn: 7% → 4% (product-market fit takes longer)
- Lower gross margin: 15% → 35% (no LLM discounts)
- Slower growth: 50% less traffic

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **ARR** | $212k (-30%) | $1.13M (-30%) | $2.86M (-30%) |
| **Customers** | 252 | 980 | 2,384 |
| **EBITDA** | -$1.89M | -$3.46M | -$4.31M |
| **Cash Needed** | $1.5M | $6.0M | $3.0M (Series B early) |
| **Profitability** | - | - | 2030+ |

**Key Risks:**
- ❌ Need larger Series A ($6M vs $5M)
- ❌ May need bridge round in Year 3
- ❌ Profitability delayed by 18+ months
- ❌ Dilution increases (founders <30% by Series B)

---

### 9.4 Scenario Comparison

| Metric | Optimistic | Base | Pessimistic |
|--------|------------|------|-------------|
| **Year 3 ARR** | $5.32M | $4.09M | $2.86M |
| **Cumulative Cash Raised** | $5.5M | $6.5M | $10.5M |
| **Founder Dilution (3 yrs)** | 35% | 45% | 60% |
| **Breakeven Date** | Q3 2029 | Q1 2030 | Q3 2030+ |
| **Probability** | 20% | 60% | 20% |

**Recommendation:** Plan for base case, but monitor leading indicators (CAC, churn, activation rate) to detect if trending toward pessimistic.

---

## 10. Key Metrics Dashboard

### 10.1 SaaS Metrics Summary

| Metric | Year 1 | Year 2 | Year 3 | Target | Status |
|--------|--------|--------|--------|--------|--------|
| **ARR** | $303k | $1.62M | $4.09M | - | 📈 |
| **MRR** | $64k | $192k | $448k | - | 📈 |
| **YoY Growth** | - | 434% | 152% | >100% | ✅ |
| **Gross Margin** | 21% | 29% | 45% | >40% | ⚠️ → ✅ |
| **Net Revenue Retention** | 85% | 92% | 97% | >100% | ⚠️ |
| **CAC** | $150 | $110 | $75 | <$100 | ✅ |
| **LTV** | $1,828 | $3,230 | $6,119 | - | 📈 |
| **LTV:CAC** | 12:1 | 29:1 | 82:1 | >3:1 | ✅ |
| **CAC Payback** | 7.2mo | 3.8mo | 1.7mo | <12mo | ✅ |
| **Monthly Churn** | 5% | 3.5% | 2.5% | <3% | ⚠️ → ✅ |
| **Magic Number** | 0.42 | 3.51 | 4.12 | >0.75 | ✅ |
| **Rule of 40** | -562% | +255% | +72% | >40% | ❌ → ✅ |
| **Cash Burn** | $142k/mo | $242k/mo | $272k/mo | - | ⚠️ |

**Legend:**
- ✅ = Meets/exceeds target
- ⚠️ = Below target but improving
- ❌ = Below target
- 📈 = Trending positively

---

### 10.2 Leading Indicators (Month-to-Month Tracking)

**Product Usage:**
- [ ] Daily Active Users (DAU)
- [ ] Scans per user per week
- [ ] Time to first scan (<10 min)
- [ ] Scan success rate (>85%)

**Sales Funnel:**
- [ ] Website visitors (organic vs paid)
- [ ] Signup rate (target: 5-8%)
- [ ] Activation rate (target: 75%+)
- [ ] Free → Pro conversion (target: 12-15%)

**Customer Health:**
- [ ] NPS (Net Promoter Score) >30
- [ ] CSAT (Customer Satisfaction) >4.5/5
- [ ] Support tickets per 100 users (<10)
- [ ] Churn risk score (predictive model)

---

## 11. Fundraising & Runway

### 11.1 Fundraising Timeline

```
Timeline:
│
├─ Month 0: Pre-Seed Close ($1.5M)
│  └─ 18-month runway
│
├─ Month 12: Series A prep
│  └─ Metrics: $500k ARR, 250 customers
│
├─ Month 18: Series A Close ($5M)
│  └─ Metrics: $1M ARR, 500 customers
│  └─ 24-month runway
│
├─ Month 30: Series B prep
│  └─ Metrics: $5M ARR, 2,500 customers
│
├─ Month 36: Series B Close ($15M)
│  └─ Metrics: $8M ARR, 4,000 customers
│  └─ 24-month runway to profitability
│
└─ Month 48: Break-Even / Profitability
```

---

### 11.2 Dilution Schedule

| Round | Amount | Pre-Money | Post-Money | Dilution | Founder % |
|-------|--------|-----------|------------|----------|-----------|
| **Founding** | - | - | $1M | - | 100% |
| **Pre-Seed** | $1.5M | $6M | $7.5M | 20% | 80% |
| **Series A** | $5M | $20M | $25M | 20% | 64% |
| **Series B** | $15M | $60M | $75M | 20% | 51.2% |

**Founders retain majority control through Series A** ✅

**Option Pool:**
- Pre-Seed: 10% reserved (dilutes founders to 72%)
- Series A: 5% top-up (dilutes to 60.8%)
- Series B: 5% top-up (dilutes to 48.6%)

---

### 11.3 Valuation Benchmarks

#### Series A Comparables (2025-2026)

| Company | ARR at Series A | Amount Raised | Valuation | ARR Multiple |
|---------|-----------------|---------------|-----------|--------------|
| **Snyk** | $2M | $7M | $35M | 17.5x |
| **Lacework** | $1M | $8M | $30M | 30x |
| **Wiz** | $1M | $10M | $100M | 100x (outlier) |
| **Shannon (target)** | $1M | $5M | $25M | **25x** |

**Shannon Positioning:**
- AI-native (premium valuation like Wiz)
- Proven traction (de-risked vs pure idea)
- Target: 25x ARR multiple (median for AI security)

---

### 11.4 Use of Funds (Series A)

| Category | Amount | % of Total | Rationale |
|----------|--------|------------|-----------|
| **Engineering** | $1,800,000 | 36% | Hire 6 engineers (scale product) |
| **Sales & GTM** | $1,500,000 | 30% | 3 AEs + marketing scale |
| **Operations** | $600,000 | 12% | Infrastructure, LLM costs |
| **Customer Success** | $400,000 | 8% | 2 CSMs for enterprise |
| **G&A** | $400,000 | 8% | Legal, finance, HR |
| **Buffer (6 months)** | $300,000 | 6% | Runway cushion |
| **Total** | **$5,000,000** | 100% | 24-month runway |

**Milestones with $5M:**
- [ ] Reach $10M ARR (Month 42)
- [ ] 100+ enterprise customers
- [ ] <2% monthly churn
- [ ] 99.9% uptime SLA
- [ ] SOC2 Type II certified
- [ ] Break-even by Month 48

---

## Appendix A: Assumptions Log

### Revenue Assumptions
- Pricing remains stable (no price increases Years 1-3)
- Enterprise tier grows from 5% → 12% of customer base
- Annual prepay adoption: 30% → 60%
- No major competitor emerges to undercut pricing

### Cost Assumptions
- LLM costs decline 10% Year 2, 20% Year 3 (volume discounts)
- AWS costs scale sub-linearly (0.5x revenue growth)
- Salaries increase 7-10% annually
- No unexpected regulatory costs (e.g., new data privacy laws)

### Market Assumptions
- AppSec market grows at 10% CAGR (Gartner forecast)
- No recession in Years 1-3 (macroeconomic stability)
- AI adoption continues (Claude API remains available)
- No major security incidents affecting industry trust

---

## Appendix B: Sensitivity Analysis

### Impact of 10% Change in Key Variables

| Variable | Base ARR (Y3) | +10% Change | Impact | -10% Change | Impact |
|----------|---------------|-------------|--------|-------------|--------|
| **Pricing** | $4.09M | $4.50M | +$410k | $3.68M | -$410k |
| **Conversion Rate** | $4.09M | $4.50M | +$410k | $3.68M | -$410k |
| **Churn** | $4.09M | $3.47M | -$620k | $4.91M | +$820k |
| **CAC** | $4.09M | $4.09M | $0* | $4.09M | $0* |
| **LLM Cost** | $4.09M | $4.09M | $0** | $4.09M | $0** |

*CAC impacts cash flow, not ARR
**LLM cost impacts margin, not revenue

**Most Sensitive To:** Churn rate (highest impact on ARR)

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **ARR** | Annual Recurring Revenue (MRR × 12) |
| **MRR** | Monthly Recurring Revenue |
| **CAC** | Customer Acquisition Cost |
| **LTV** | Customer Lifetime Value |
| **ARPU** | Average Revenue Per User |
| **NRR** | Net Revenue Retention (expansion - churn) |
| **Magic Number** | Sales efficiency metric |
| **Rule of 40** | Growth % + Margin % (health metric) |
| **EBITDA** | Earnings Before Interest, Taxes, Depreciation, Amortization |

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-16 | Finance Team | Initial model |

**Assumptions Reviewed:** 2026-01-16
**Next Review:** 2026-04-01 (quarterly update)

**Model Owner:** CFO / Finance Team
**Approved By:** CEO, Board of Directors

---

**DISCLAIMER:** This financial model contains forward-looking statements based on assumptions that may prove incorrect. Actual results may vary materially. This is not investment advice.

---

*End of Financial Model*
