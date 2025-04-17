# POS Sales Associate Tracking for Odoo 18

This module extends the Odoo 18 Point of Sale system to track which sales associate facilitated each transaction, enabling performance analysis and reporting by sales associate.

## Features

- **Sales Associate Selection**: During checkout, assign a sales associate to each transaction
- **Performance Tracking**: View and analyze sales performance by associate
- **Reporting Dashboard**: Built-in reports for management to track key metrics by associate
- **Receipt Integration**: Display the sales associate name on receipts

## Installation

1. Clone this repository into your Odoo `custom_addons` directory:
   ```bash
   git clone [repo_url] custom_addons/pos_sales_associate
   ```

2. Update your `odoo.conf` file to include the new module path:
   ```
   addons_path = /path/to/odoo/addons,/path/to/custom_addons
   ```

3. Restart your Odoo service:
   ```bash
   service odoo restart
   ```

4. Install the module:
   - Go to Apps in your Odoo dashboard
   - Remove the "Apps" filter and search for "POS Sales Associate Tracking"
   - Click Install

## Configuration

1. Ensure your employees are set up in the HR module:
   - Go to Employees > Employees
   - Create records for all sales associates

2. Make sure the POS HR module is enabled:
   - Go to Point of Sale > Configuration > Point of Sale
   - Edit your POS configuration
   - Enable "Employees" feature

## Usage

### Recording Sales by Associate

1. Open the POS interface
2. Start a new order
3. Click the "Select Associate" button
4. Choose the sales associate who facilitated the sale
5. Complete the order as usual

### Viewing Reports

1. Go to Point of Sale > Reporting > Sales Associate Performance
2. View sales performance by associate with various metrics
3. Use filters and grouping options to analyze specific time periods or products

## Support

For any issues or questions, please contact:
- Email: support@yourcompany.com
- Website: https://www.yourcompany.com

## License

This module is licensed under LGPL-3.