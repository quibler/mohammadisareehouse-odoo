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


class PosCategory(models.Model):
    _inherit = 'pos.category'

    name_ar = fields.Char(string="Arabic Name", compute="_compute_name_ar", store=False)

    @api.depends('name')
    def _compute_name_ar(self):
        """Compute Arabic translation for category name"""
        for category in self:
            arabic_name = None
            for lang_code in ['ar_001', 'ar']:
                try:
                    translated_name = category.with_context(lang=lang_code).name
                    if translated_name and translated_name != category.name:
                        arabic_name = translated_name
                        break
                except:
                    continue
            category.name_ar = arabic_name

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields = super()._load_pos_data_fields(config_id)
        fields.append('name_ar')
        return fields





