# POS Invoice Payment

Allow POS users to register payments for customer invoices directly from the POS interface without requiring accounting module access.

## Features

- **Invoice List Screen**: Browse customer invoices with search and filter capabilities
- **Payment Registration**: Register full or partial payments using POS payment methods
- **Thermal Receipt Printing**: Print payment receipts on POS thermal printers
- **No POS Order Creation**: Direct payment registration without creating POS orders
- **Session Compatible**: Works seamlessly with POS session balancing
- **Partial Payment Support**: Handle partial payments with remaining balance tracking

## Usage

1. Open POS and start a session
2. Click the hamburger menu (☰) in the top right
3. Select **"Invoices"** from the dropdown menu
4. Browse the invoice list (search by customer name or invoice number)
5. Click an invoice to view details in the right panel
6. Click **"Register Payment"** button
7. Select payment method and amount (can be edited for partial payment)
8. Validate the payment
9. Receipt is automatically printed

## UI Flow

### Invoice Screen
- **Left Panel**: Searchable/filterable list of customer invoices
- **Right Panel**: Selected invoice details with payment history
- **Filters**: All / Unpaid / Partial / Unpaid+Partial

### Payment Flow
1. Select invoice → Shows details
2. Click "Register Payment" → Navigate to standard POS PaymentScreen
3. Select payment method → Validate
4. Print receipt → Return to invoice list

## Technical Details

### Backend
- Uses Odoo's standard `account.payment` model
- Automatic reconciliation with invoice
- Transaction-safe payment creation
- Validates partial payment amounts

### Frontend
- Extends POS navbar with "Invoices" menu item
- Custom InvoiceScreen component (similar to TicketScreen)
- Payment screen integration for invoice payments
- Custom receipt template

### Security
- POS users can read posted customer invoices only
- POS users can create inbound customer payments
- No write access to invoices or accounting records
- Record rules restrict access to appropriate data

## Requirements

- Odoo 18.0
- point_of_sale module
- account module

## Installation

1. Copy module to `custom-addons/` directory
2. Update apps list
3. Install "POS Invoice Payment" module
4. Restart POS session

## Configuration

No additional configuration required. The module uses existing POS payment methods and session settings.

## Notes

- **No Duplicate Payments**: Backend validates payment amounts against invoice residual
- **Partial Payments**: System tracks remaining balance after each payment
- **Session Balance**: Payments use POS payment method journals, maintaining session balance
- **No POS Orders**: Invoice payments don't create pos.order records
- **Receipt Printing**: Uses existing POS printer configuration

## License

LGPL-3
