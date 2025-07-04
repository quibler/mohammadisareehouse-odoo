========================
**POS Allowed Customer**
========================

**Description**
***************
* This module is for loading only customers (customer_rank > 0) on the POS level.

**Author**
**********
* BizzAppDev Systems Pvt. Ltd.

**Installation**
****************
* Under applications, the application pos_allowed_customer can be installed/uninstalled.

**Configuration**
*****************
* No configuration needed. The module automatically loads all partners marked as customers.

**Usage**
*********
* Modified to use standard Odoo customer_rank field:
   - Only partners with customer_rank > 0 will be loaded on the POS level.
   - No separate "Available in POS" field needed - uses Odoo's built-in customer classification.
   - Partners marked as customers in their form (Customer checkbox) will automatically appear in POS.

**Table of contents**
*********************
.. contents::
   :local:

**Bug Tracker**
***************
* Do not contact contributors directly about support or help with technical issues.

**Credits**
***********
* #N/A

**Known issues/Roadmap**
************************
* #N/A

**Changelog**
*************
* 25-07-2023 - T6480 - PKP - Allowed Customer Load in POS
* 04-07-2025 - Modified to use customer_rank > 0 instead of custom available_in_pos field