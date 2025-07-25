# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.osv.expression import OR


class PosConfig(models.Model):
    _inherit = 'pos.config'

    sales_person_ids = fields.Many2many(
        'hr.employee',
        'config_salesperson_rel',
        'config_id',
        'employee_id',
        string="Allowed Sales Persons",
        help="Restrict which employees can be selected as sales persons in this POS"
    )

    def _employee_domain(self, user_id):
        """Override to respect sales person restrictions"""
        domain = super()._employee_domain(user_id)

        if self.module_pos_hr:
            if self.sales_person_ids:
                # Add allowed sales persons to the domain
                domain = OR([domain, [('id', 'in', self.sales_person_ids.ids)]])
            else:
                # If no sales persons configured, use default domain
                pass
        else:
            # If pos_hr is disabled, only use configured sales persons
            domain = [('id', 'in', self.sales_person_ids.ids)]

        return domain

    def _get_pos_ui_pos_config(self, params):
        """Add sales person IDs to frontend config"""
        config_data = super()._get_pos_ui_pos_config(params)
        config_data['sales_person_ids'] = self.sales_person_ids.ids
        return config_data


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config_id):
        """Ensure hr.employee is loaded for sales person functionality"""
        data = super()._load_pos_data_models(config_id)
        config = self.env['pos.config'].browse(config_id)

        # Always load employees if we have sales person restrictions
        if not config.module_pos_hr and config.sales_person_ids:
            data += ['hr.employee']

        return data

    @api.model
    def create_cash_out_entry(self, session_id, amount, reason):
        """Create a cash out entry during session closing"""
        session = self.browse(session_id)
        session.ensure_one()

        if not session.cash_journal_id or amount <= 0:
            return False

        # Create a bank statement line for cash out
        cash_out_line = self.env['account.bank.statement.line'].create({
            'journal_id': session.cash_journal_id.id,
            'payment_ref': reason,
            'amount': -amount,  # Negative for cash out
            'date': fields.Date.context_today(self),
            'pos_session_id': session.id,
        })

        # Post a message to the session for audit trail
        session.message_post(
            body=_("Automatic cash collection: %s - Amount: %s") % (
                reason,
                session.currency_id.format(amount)
            )
        )

        return cash_out_line.id

    def post_closing_cash_details(self, counted_cash):
        """Override to handle automatic cash out before normal closing"""

        # First, check if we should do automatic cash out
        if self.config_id.cash_control and counted_cash > 0:
            # Create automatic cash out for all counted cash
            try:
                self.create_cash_out_entry(
                    self.id,
                    counted_cash,
                    _('Cash Collection - End of Day Deposit')
                )
                # Set counted cash to 0 since we're taking it all out
                counted_cash = 0.0
            except Exception as e:
                # Log error but continue with normal closing
                self.message_post(
                    body=_("Warning: Could not create automatic cash out: %s") % str(e)
                )

        # Continue with normal closing process using 0 as counted cash
        return super().post_closing_cash_details(counted_cash)

    def _compute_cash_balance(self):
        """Ensure proper cash balance computation"""
        super()._compute_cash_balance()

        # After auto cash out, the difference should be minimal/zero
        for session in self:
            # If we have automatic cash collection, the difference should reflect
            # only actual discrepancies, not planned cash removal
            pass


class PosOrder(models.Model):
    _inherit = 'pos.order'

    sales_person_id = fields.Many2one(
        'hr.employee',
        string='Sales Person',
        help="Employee who handled this order"
    )

    def _get_fields_for_order_line(self):
        """Include sales person in order line data"""
        fields = super()._get_fields_for_order_line()
        fields.append('sales_person_id')
        return fields

    def _prepare_mail_values(self, email, ticket, basic_ticket):
        """Custom email template for Mohammadi saree house - Kuwait Retail"""
        from markupsafe import Markup

        # Check if order is linked to a customer and construct greeting accordingly
        if self.partner_id and self.partner_id.id != self.env.company.partner_id.id:
            # Order is linked to a customer - start with "Dear {customer name}"
            greeting = _("Dear %(customer_name)s, ") % {
                'customer_name': self.partner_id.name
            }
        else:
            # No customer linked - use generic "Dear Customer,"
            greeting = _("Dear Customer, ")

        # Custom message with conditional greeting
        message = Markup(
            _("%(greeting)s"
              "Thank you for your order with Mohammadi saree house, "
              "Here is your receipt amounting %(amount)s.<br/><br/>"
              "For more, contact us on WhatsApp - 94190213")
        ) % {
                      'greeting': greeting,
                      'amount': self.currency_id.format(self.amount_total),
                  }

        return {
            'subject': _('Receipt'),
            'body_html': f"<p>{message}</p>",
            'author_id': self.env.user.partner_id.id,
            'email_from': self.env.company.email or self.env.user.email_formatted,
            'email_to': email,
            'attachment_ids': self._add_mail_attachment(self.name, ticket, basic_ticket),
        }

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_sales_person_ids = fields.Many2many(
        related='pos_config_id.sales_person_ids',
        readonly=False,
        string="Allowed Sales Persons"
    )


class AccountMove(models.Model):
    _inherit = "account.move"

    pos_sales_person_id = fields.Many2one(
        "hr.employee",
        string="POS Sales Person",
        help="Sales person from the original POS order"
    )


class ResPartner(models.Model):
    _inherit = "res.partner"

    @api.model
    def _load_pos_data_domain(self, data):
        """Load only customers in POS"""
        domain = super()._load_pos_data_domain(data)
        domain.append(("customer_rank", ">", 0))
        return domain

    @api.model
    def _load_pos_data_fields(self, config_id):
        """Include customer_rank field"""
        fields = super()._load_pos_data_fields(config_id)
        if 'customer_rank' not in fields:
            fields.append('customer_rank')
        return fields


class ResCompany(models.Model):
    _inherit = 'res.company'

    @api.model
    def _load_pos_data_fields(self, config_id):
        """Include mobile field for receipts"""
        fields = super()._load_pos_data_fields(config_id)
        if 'mobile' not in fields:
            fields.append('mobile')
        return fields