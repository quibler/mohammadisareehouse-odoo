from odoo import models, fields, api, _
from odoo.exceptions import UserError
import re # Import regular expressions for validation (optional)

# Optional: Function to calculate EAN13 check digit
def calculate_ean13_check_digit(code_without_check_digit):
    """Calculates the EAN13 check digit."""
    if not code_without_check_digit or len(code_without_check_digit) != 12 or not code_without_check_digit.isdigit():
        return None # Invalid input

    weights = [1, 3] * 6
    weighted_sum = sum(int(digit) * weight for digit, weight in zip(code_without_check_digit, weights))
    check_digit = (10 - (weighted_sum % 10)) % 10
    return str(check_digit)

class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.model_create_multi
    def create(self, vals_list):
        """Override create to auto-generate barcode if empty."""
        for vals in vals_list:
            # Check if barcode is not provided or is empty
            if 'barcode' not in vals or not vals.get('barcode'):
                # Generate barcode using the sequence
                # The sequence code 'product.barcode.sequence' must match ir_sequence_data.xml
                generated_code = self.env['ir.sequence'].next_by_code('product.barcode.sequence')

                if generated_code:
                    # --- Calculate and append EAN13 check digit ---
                    if len(generated_code) == 12 and generated_code.isdigit():
                         check_digit = calculate_ean13_check_digit(generated_code)
                         if check_digit is not None:
                             vals['barcode'] = generated_code + check_digit
                         else:
                             # Fallback or raise error if check digit calculation fails
                             vals['barcode'] = generated_code # Or handle differently
                    else:
                         # Handle cases where sequence doesn't produce 12 digits (e.g., log warning, use raw code)
                         vals['barcode'] = generated_code # Fallback to raw sequence

                else:
                    # Handle error: Sequence not found or failed to generate
                    # You might want to log this or raise a specific error
                    # For now, we'll just skip barcode generation for this product
                    raise UserError(_("Could not generate barcode sequence."))

            # Optional: Add validation if a barcode *is* provided
            # elif vals.get('barcode'):
            #     # Example: Validate EAN13 format if provided
            #     barcode = vals['barcode']
            #     if not re.match(r'^\d{13}$', barcode):
            #          raise UserError(_("Provided barcode '%s' is not a valid EAN13 format (13 digits).") % barcode)
            #     # Add check digit validation if needed

        # Call the original create method
        products = super(ProductProduct, self).create(vals_list)

        # Optional: You might need to ensure uniqueness if sequences could potentially clash
        # with manually entered codes, although sequences should guarantee unique generated codes.

        return products

    # Optional: Add constraint to ensure barcode uniqueness system-wide
    _sql_constraints = [
        ('barcode_uniq', 'unique(barcode)', 'A barcode can only be assigned to one product !')
    ]