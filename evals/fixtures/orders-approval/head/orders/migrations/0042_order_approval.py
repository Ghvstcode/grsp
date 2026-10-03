from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("orders", "0041_order_currency")]

    operations = [
        # status is a plain varchar; PENDING_APPROVAL needs room for 16 characters.
        migrations.AlterField("order", "status", models.CharField(max_length=24)),
        migrations.AddField("order", "approved_by", models.IntegerField(null=True)),
        migrations.AddField("order", "approved_at", models.DateTimeField(null=True)),
    ]
