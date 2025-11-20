import { Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, Field, Input, Spinner, Switch } from '../components/ui';
import { api, type BusinessHourDto } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

interface StoreForm {
  name: string;
  legalName: string;
  cnpj: string;
  whatsapp: string;
  phone: string;
  email: string;
  street: string;
  number: string;
  district: string;
  city: string;
  uf: string;
  cep: string;
  instagram: string;
}

export function SettingsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [store, setStore] = useState<StoreForm | null>(null);
  const [hours, setHours] = useState<BusinessHourDto[]>([]);

  const settings = useQuery({ queryKey: ['configuracoes'], queryFn: api.settings.get });

  useEffect(() => {
    if (!settings.data) return;

    const info = settings.data.info;
    setStore({
      name: info?.name ?? '',
      legalName: info?.legalName ?? '',
      cnpj: info?.cnpj ?? '',
      whatsapp: info?.whatsapp ?? '',
      phone: info?.phone ?? '',
      email: info?.email ?? '',
      street: info?.address.street ?? '',
      number: info?.address.number ?? '',
      district: info?.address.district ?? '',
      city: info?.address.city ?? '',
      uf: info?.address.uf ?? 'SP',
      cep: info?.address.cep ?? '',
      instagram: info?.instagram ?? '',
    });

    setHours(
      settings.data.hours.length === 7
        ? settings.data.hours
        : WEEKDAYS.map((_, weekday) => ({
            weekday,
            opensAt: '09:00',
            closesAt: '18:00',
            closed: weekday === 0,
          })),
    );
  }, [settings.data]);

  const saveStore = useMutation({
    mutationFn: (form: StoreForm) =>
      api.settings.updateStore({
        name: form.name,
        legalName: form.legalName,
        cnpj: form.cnpj.replace(/\D/g, ''),
        whatsapp: form.whatsapp.replace(/\D/g, ''),
        phone: form.phone ? form.phone.replace(/\D/g, '') : null,
        email: form.email || null,
        address: {
          street: form.street,
          number: form.number,
          district: form.district,
          city: form.city,
          uf: form.uf.toUpperCase(),
          cep: form.cep.replace(/\D/g, ''),
        },
        instagram: form.instagram || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      toast.success('Dados da loja salvos.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveHours = useMutation({
    mutationFn: () => api.settings.updateHours(hours),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      toast.success('Horários salvos. O aviso de aberto/fechado já usa os novos.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (settings.isLoading || !store) return <Spinner />;

  const readOnly = !can('configuracoes:editar');

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Dados que aparecem no rodapé, no WhatsApp e no aviso de horário da vitrine."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Dados da loja"
          actions={
            <Button
              size="sm"
              disabled={readOnly || saveStore.isPending}
              onClick={() => saveStore.mutate(store)}
            >
              Salvar
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome fantasia" required className="sm:col-span-2">
              <Input
                value={store.name}
                onChange={(event) => setStore({ ...store, name: event.target.value })}
              />
            </Field>

            <Field label="Razão social" className="sm:col-span-2">
              <Input
                value={store.legalName}
                onChange={(event) => setStore({ ...store, legalName: event.target.value })}
              />
            </Field>

            <Field label="CNPJ">
              <Input
                value={store.cnpj}
                onChange={(event) => setStore({ ...store, cnpj: event.target.value })}
              />
            </Field>

            <Field label="WhatsApp" hint="Com DDI e DDD: 5511999990000">
              <Input
                value={store.whatsapp}
                onChange={(event) => setStore({ ...store, whatsapp: event.target.value })}
              />
            </Field>

            <Field label="Telefone fixo">
              <Input
                value={store.phone}
                onChange={(event) => setStore({ ...store, phone: event.target.value })}
              />
            </Field>

            <Field label="E-mail" hint="Remetente dos e-mails e contato do rodapé">
              <Input
                type="email"
                value={store.email}
                onChange={(event) => setStore({ ...store, email: event.target.value })}
              />
            </Field>

            <Field label="Rua" className="sm:col-span-2">
              <Input
                value={store.street}
                onChange={(event) => setStore({ ...store, street: event.target.value })}
              />
            </Field>

            <Field label="Número">
              <Input
                value={store.number}
                onChange={(event) => setStore({ ...store, number: event.target.value })}
              />
            </Field>

            <Field label="Bairro">
              <Input
                value={store.district}
                onChange={(event) => setStore({ ...store, district: event.target.value })}
              />
            </Field>

            <Field label="Cidade">
              <Input
                value={store.city}
                onChange={(event) => setStore({ ...store, city: event.target.value })}
              />
            </Field>

            <Field label="UF">
              <Input
                maxLength={2}
                value={store.uf}
                onChange={(event) => setStore({ ...store, uf: event.target.value })}
              />
            </Field>

            <Field label="CEP">
              <Input
                value={store.cep}
                onChange={(event) => setStore({ ...store, cep: event.target.value })}
              />
            </Field>

            <Field label="Instagram" className="sm:col-span-2">
              <Input
                value={store.instagram}
                onChange={(event) => setStore({ ...store, instagram: event.target.value })}
              />
            </Field>
          </div>
        </Card>

        <div className="space-y-5">
          <Card
            title="Horário de funcionamento"
            description="Define o aviso “Aberto agora / Fechado” e a mensagem de fora do horário."
            actions={
              <Button
                size="sm"
                disabled={readOnly || saveHours.isPending}
                onClick={() => saveHours.mutate()}
              >
                Salvar
              </Button>
            }
          >
            <ul className="space-y-3">
              {hours.map((hour, index) => (
                <li key={hour.weekday} className="flex flex-wrap items-center gap-3">
                  <span className="text-ink-700 w-28 text-sm">{WEEKDAYS[hour.weekday]}</span>

                  <Input
                    type="time"
                    aria-label={`Abre em ${WEEKDAYS[hour.weekday]}`}
                    className="w-28"
                    value={hour.opensAt}
                    disabled={hour.closed}
                    onChange={(event) =>
                      setHours((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, opensAt: event.target.value } : item,
                        ),
                      )
                    }
                  />

                  <Input
                    type="time"
                    aria-label={`Fecha em ${WEEKDAYS[hour.weekday]}`}
                    className="w-28"
                    value={hour.closesAt}
                    disabled={hour.closed}
                    onChange={(event) =>
                      setHours((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, closesAt: event.target.value } : item,
                        ),
                      )
                    }
                  />

                  <Switch
                    label="Fechado"
                    checked={hour.closed}
                    onChange={(closed) =>
                      setHours((current) =>
                        current.map((item, i) => (i === index ? { ...item, closed } : item)),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Formas de receber"
            description="O site não calcula frete: o valor do motoboy é combinado no atendimento."
          >
            <ul className="divide-ink-200 divide-y">
              {(settings.data?.deliveryMethods ?? []).map((method) => (
                <li key={method.id} className="py-2.5">
                  <p className="text-ink-800 font-medium">
                    {method.label}
                    <span className="text-ink-500 ml-2 text-sm font-normal">
                      {method.priceLabel}
                    </span>
                  </p>
                  {method.description ? (
                    <p className="text-ink-500 text-xs">{method.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
