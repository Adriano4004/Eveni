import { expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { formatarData, hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { envValido } from '../tests/ajuda.js';
import { contaConfirmada, emDias, PALAVRA_PASSE } from './ajuda.js';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('sem e-mail confirmado, não aparece o botão de criar projecto', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Dora');
  await page.getByLabel('E-mail').fill(`dora.${Date.now()}@exemplo.ao`);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Para criar projectos, confirme primeiro o seu e-mail.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo projecto' })).toHaveCount(0);
});

test('criar uma conferência de imprensa com pouco tempo: avisos, confirmação e tarefas com notas', async ({ page }) => {
  await contaConfirmada(page, 'Elsa');
  await expect(page.getByText(/Ainda não tem projectos/)).toBeVisible();
  await page.getByRole('button', { name: 'Novo projecto' }).click();

  await expect(page.getByRole('heading', { name: 'Novo projecto' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Conferência de Imprensa/ })).toBeChecked();
  await page.getByLabel('Nome do projecto').fill('Apresentação <b>da campanha</b>');
  await page.getByLabel('Local (opcional)').fill('Centro de Imprensa, Luanda');

  // Com tempo suficiente, sem avisos.
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();

  // Com 7 dias: comprime e avisa das críticas, antes de criar.
  await page.getByLabel('Data do evento').fill(emDias(7));
  await expect(page.getByText(/Faltam 7 dias e este tipo de projecto pede 21/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarefas críticas sem tempo suficiente' })).toBeVisible();
  await expect(page.getByText('Validar que existe facto novo')).toBeVisible();

  // Sem confirmar os avisos, não cria.
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByText('Confirme que leu os avisos sobre as tarefas críticas.')).toBeVisible();

  await page.getByLabel('Li os avisos e quero criar o projecto assim.').check();
  await page.getByRole('button', { name: 'Criar projecto' }).click();

  // O nome aparece como texto, sem interpretar HTML.
  await expect(page.getByRole('heading', { name: 'Apresentação <b>da campanha</b>' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: formatarData(emDias(7)) })).toBeVisible();
  await expect(page.getByText('Centro de Imprensa, Luanda')).toBeVisible();
  await expect(page.getByText('0 de 47 tarefas concluídas')).toBeVisible();

  // A nota aparece em destaque ao abrir a tarefa.
  const tarefa = page.locator('details', { hasText: 'Validar que existe facto novo' });
  await expect(tarefa.getByText('Se não há notícia, não há conferência.', { exact: false })).toBeHidden();
  await tarefa.locator('summary').click();
  await expect(tarefa.getByText(/Se não há notícia, não há conferência\./)).toBeVisible();
  await expect(tarefa.getByText('Crítica')).toBeVisible();

  // Resumo do orçamento a zero, em Kwanza (as rubricas vêem-se no ecrã do orçamento).
  await expect(page.getByText('Total previsto 0,00 Kz · Real 0,00 Kz')).toBeVisible();

  // De volta ao início: o projecto está na lista e o plano Singular já não deixa criar outro.
  await page.getByRole('button', { name: 'Voltar ao início' }).click();
  await expect(page.getByRole('link', { name: /Apresentação <b>da campanha<\/b>/ })).toBeVisible();
  await expect(page.getByText('O plano Singular permite 1 projecto. Para criar mais, mude para o plano Empresarial.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo projecto' })).toHaveCount(0);

  // Recarregar o endereço do projecto abre-o directamente.
  await page.getByRole('link', { name: /Apresentação/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Apresentação <b>da campanha</b>' })).toBeVisible();
});

test('criar um congresso: escolher o T03, ver os avisos de prazo e as 74 tarefas', async ({ page }) => {
  await contaConfirmada(page, 'Gilda');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByRole('radio', { name: /Congresso/ }).check();
  await page.getByLabel('Nome do projecto').fill('Congresso Nacional de Engenharia');

  // Um congresso pede 180 dias: a 60 dias, as primeiras tarefas críticas já não cabem.
  await page.getByLabel('Data do evento').fill(emDias(60));
  await expect(page.getByText(/Faltam 60 dias e este tipo de projecto pede 180/)).toBeVisible();
  await expect(page.getByText('Definir objectivo e resultados esperados')).toBeVisible();

  await page.getByLabel('Data do evento').fill(emDias(200));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();

  await expect(page.getByRole('heading', { name: 'Congresso Nacional de Engenharia' })).toBeVisible();
  await expect(page.getByText('0 de 74 tarefas concluídas')).toBeVisible();
  const tarefa = page.locator('details', { hasText: 'Definir objectivo e resultados esperados' });
  await tarefa.locator('summary').click();
  await expect(tarefa.getByText(/O que tem de ser verdade a D\+30/)).toBeVisible();
});

test('o Fórum e a Conferência aparecem com a descrição, e a Conferência não se confunde com a de imprensa', async ({ page }) => {
  await contaConfirmada(page, 'Helena');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await expect(page.getByRole('radio', { name: /Conferência de Imprensa/ })).toHaveCount(1);
  await expect(page.getByText(/Um dia de palestras, com inscrições abertas/)).toBeVisible();
  await page.getByRole('radio', { name: /Fórum/ }).check();
  await page.getByLabel('Nome do projecto').fill('Fórum da Juventude Empreendedora');
  await page.getByLabel('Data do evento').fill(emDias(100));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByRole('heading', { name: 'Fórum da Juventude Empreendedora' })).toBeVisible();
  await expect(page.getByText('0 de 62 tarefas concluídas')).toBeVisible();
  await expect(page.getByText('Criar site ou página do evento')).toBeVisible();
});

test('criar um festival: escolher o T04, ver os avisos de prazo e a nota da época das chuvas', async ({ page }) => {
  await contaConfirmada(page, 'Isabel');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByRole('radio', { name: /Festival \/ Concerto/ }).check();
  await page.getByLabel('Nome do projecto').fill('Festival de Kizomba da Ilha');

  // Um festival pede 240 dias: a 90 dias, as primeiras tarefas críticas já não cabem.
  await page.getByLabel('Data do evento').fill(emDias(90));
  await expect(page.getByText(/Faltam 90 dias e este tipo de projecto pede 240/)).toBeVisible();
  await expect(page.getByText('Definir data e verificar época das chuvas')).toBeVisible();

  await page.getByLabel('Data do evento').fill(emDias(250));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();

  await expect(page.getByRole('heading', { name: 'Festival de Kizomba da Ilha' })).toBeVisible();
  await expect(page.getByText('0 de 86 tarefas concluídas')).toBeVisible();
  const tarefa = page.locator('details', { hasText: 'Definir data e verificar época das chuvas' });
  await tarefa.locator('summary').click();
  await expect(tarefa.locator('.nota')).toContainText('época das chuvas de Novembro a Abril');
});

test('criar um casamento: a 60 dias avisa dos convites; com tempo, as 69 tarefas e a nota do lobolo', async ({ page }) => {
  await contaConfirmada(page, 'Joana');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByRole('radio', { name: /Casamento/ }).check();
  await page.getByLabel('Nome do projecto').fill('Casamento da Joana e do Paulo');

  await page.getByLabel('Data do evento').fill(emDias(60));
  await expect(page.getByText(/Faltam 60 dias e este tipo de projecto pede 365/)).toBeVisible();
  await expect(page.getByText('Enviar convites')).toBeVisible();

  await page.getByLabel('Data do evento').fill(emDias(400));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();

  await expect(page.getByRole('heading', { name: 'Casamento da Joana e do Paulo' })).toBeVisible();
  await expect(page.getByText('0 de 69 tarefas concluídas')).toBeVisible();
  const tarefa = page.locator('details', { hasText: 'Negociação e acordo do lobolo' });
  await tarefa.locator('summary').click();
  await expect(tarefa.locator('.nota')).toContainText('Orçamentar em rubrica separada');
});

test('criar um aniversário: 47 tarefas, sem noivos, e a nota dos convites reescrita', async ({ page }) => {
  await contaConfirmada(page, 'Luzia');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByRole('radio', { name: /Aniversário/ }).check();
  await page.getByLabel('Nome do projecto').fill('50 anos da Tia Rosa');
  await page.getByLabel('Data do evento').fill(emDias(130));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();

  await expect(page.getByRole('heading', { name: '50 anos da Tia Rosa' })).toBeVisible();
  await expect(page.getByText('0 de 47 tarefas concluídas')).toBeVisible();
  await expect(page.getByText('Visitar e reservar espaço da festa')).toBeVisible();
  await expect(page.getByText(/lobolo|alembamento/i)).toHaveCount(0);
  const tarefa = page.locator('details', { hasText: 'Enviar convites' });
  await tarefa.locator('summary').click();
  await expect(tarefa.locator('.nota')).toContainText('Seis semanas antes');
});

test('não é possível abrir o projecto de outra pessoa', async ({ browser }) => {
  const dona = await (await browser.newContext()).newPage();
  await contaConfirmada(dona, 'Fatima');
  await dona.getByRole('button', { name: 'Novo projecto' }).click();
  await dona.getByLabel('Nome do projecto').fill('Projecto privado');
  await dona.getByLabel('Data do evento').fill(emDias(40));
  await expect(dona.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await dona.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(dona.getByRole('heading', { name: 'Projecto privado' })).toBeVisible();
  const endereco = dona.url();

  const outra = await (await browser.newContext()).newPage();
  await contaConfirmada(outra, 'Gil');
  await outra.goto(endereco);
  await expect(outra.getByRole('alert')).toHaveText('Projecto não encontrado.');
  await expect(outra.getByText('Projecto privado')).toHaveCount(0);
});

test('trabalhar as tarefas: concluir, escolher responsável e ver os atrasos', async ({ page }) => {
  await contaConfirmada(page, 'Helena');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Conferência sobre o OGE');
  // Evento daqui a 5 dias: há tarefas críticas com prazo já passado.
  await page.getByLabel('Data do evento').fill(emDias(5));
  await page.getByLabel('Li os avisos e quero criar o projecto assim.').check();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByRole('heading', { name: 'Conferência sobre o OGE' })).toBeVisible();

  // Alerta de críticas em atraso no topo.
  const alerta = page.getByRole('status').filter({ hasText: 'em atraso' });
  await expect(alerta).toBeVisible();
  const textoAntes = await alerta.getByRole('heading').textContent();
  const antes = Number(/^(\d+)/.exec(textoAntes ?? '')?.[1]);
  expect(antes).toBeGreaterThan(1);
  await expect(alerta.getByText('Validar que existe facto novo')).toBeVisible();

  // Concluir com a caixa ao lado da tarefa.
  await page.getByRole('checkbox', { name: 'Concluída: Validar que existe facto novo' }).check();
  await expect(page.getByText('1 de 47 tarefas concluídas')).toBeVisible();
  await expect(alerta.getByRole('heading')).toHaveText(`${antes - 1} tarefas críticas em atraso`);
  await expect(alerta.getByText('Validar que existe facto novo')).toHaveCount(0);

  // Escolher o responsável e o estado dentro da tarefa.
  const tarefa = page.locator('li.tarefa-linha', { hasText: 'Definir objectivo e mensagem-chave' });
  await tarefa.locator('summary').click();
  await tarefa.getByLabel('Responsável').selectOption({ label: 'Helena' });
  await expect(tarefa.locator('.tarefa__responsavel')).toHaveText('Helena');
  await tarefa.getByLabel('Estado').selectOption({ label: 'Em curso' });
  await expect(tarefa.locator('summary').getByText('Em curso')).toBeVisible();

  // Tudo ficou guardado no servidor.
  await page.reload();
  await expect(page.getByText('1 de 47 tarefas concluídas')).toBeVisible();
  await expect(page.locator('li.tarefa-linha', { hasText: 'Definir objectivo e mensagem-chave' }).locator('.tarefa__responsavel')).toHaveText('Helena');

  // Progresso por categoria.
  await page.getByText('Progresso por categoria').click();
  await expect(page.locator('.progresso li', { hasText: 'Estratégia' })).toContainText('1 de');

  // No início, o projecto mostra as críticas em atraso.
  await page.getByRole('button', { name: 'Voltar ao início' }).click();
  await expect(page.getByText(`${antes - 1} críticas em atraso`)).toBeVisible();
});

test('filtrar as tarefas e ver o calendário', async ({ page }) => {
  await contaConfirmada(page, 'Ivone');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Apresentação de resultados');
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByRole('heading', { name: 'Apresentação de resultados' })).toBeVisible();

  // Filtros: só críticas, depois por categoria; limpar volta a mostrar tudo.
  await page.getByText('Filtros', { exact: true }).click();
  await page.getByLabel('Só críticas').check();
  await expect(page.getByText('A mostrar 20 de 47 tarefas')).toBeVisible();
  await expect(page.locator('li.tarefa-linha')).toHaveCount(20);
  await page.locator('.filtros').getByLabel('Categoria').selectOption('Estratégia');
  await expect(page.locator('li.tarefa-linha').first()).toContainText('Validar que existe facto novo');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.locator('li.tarefa-linha')).toHaveCount(47);

  // Atribuídas a mim: nenhuma, até escolher o responsável de uma tarefa.
  await page.getByText('Filtros', { exact: true }).click();
  await page.locator('.filtros').getByLabel('Responsável').selectOption({ label: 'Atribuídas a mim' });
  await expect(page.getByText('Nenhuma tarefa com estes filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  const tarefa = page.locator('li.tarefa-linha', { hasText: 'Validar que existe facto novo' });
  await tarefa.locator('summary').click();
  await tarefa.getByLabel('Responsável').selectOption({ label: 'Ivone' });
  await expect(tarefa.locator('.tarefa__responsavel')).toHaveText('Ivone');
  await page.getByText('Filtros', { exact: true }).click();
  await page.locator('.filtros').getByLabel('Responsável').selectOption({ label: 'Atribuídas a mim' });
  await expect(page.locator('li.tarefa-linha')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();

  // Calendário: abre no mês de hoje; o dia do evento está marcado; tocar num dia mostra as tarefas.
  await page.getByRole('button', { name: 'Calendário' }).click();
  const evento = emDias(30);
  const [ano, mes] = evento.split('-').map(Number) as [number, number];
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  // O calendário abre no mês de hoje ou, se o projecto ainda não lá chegou, no primeiro mês com tarefas.
  // Avançar até ao mês do evento (no máximo 2 meses à frente, com o evento a 30 dias).
  const titulo = `${meses[mes - 1]} ${ano}`;
  const cabecalho = page.locator('.calendario__cabecalho h3');
  await expect(cabecalho).toBeVisible();
  for (let i = 0; i < 3 && (await cabecalho.textContent()) !== titulo; i++) {
    await page.getByRole('button', { name: 'Mês seguinte' }).click();
  }
  await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
  const diaEvento = page.getByRole('button', { name: /Dia do evento/ });
  await expect(diaEvento).toBeVisible();
  await diaEvento.click();
  await expect(page.getByRole('heading', { name: `Tarefas a ${formatarData(evento)}` })).toBeVisible();
  await expect(page.locator('.calendario__dia-escolhido li.tarefa-linha').first()).toBeVisible();
});


test('arquivar e restaurar um projecto', async ({ page }) => {
  await contaConfirmada(page, 'Jorge');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Lançamento do produto');
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByRole('heading', { name: 'Lançamento do produto' })).toBeVisible();

  // Arquivar pede confirmação; depois fica só de leitura.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Arquivar projecto' }).click();
  await expect(page.getByText('Este projecto está arquivado: pode ser consultado, mas não alterado.')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Concluída: Validar que existe facto novo' })).toBeDisabled();

  // No início, sai da lista principal e aparece nos arquivados; continua a contar para o plano.
  await page.getByRole('button', { name: 'Voltar ao início' }).click();
  await expect(page.getByText('Arquivados (1)')).toBeVisible();
  await expect(page.getByRole('link', { name: /Lançamento do produto/ })).toBeHidden();
  await expect(page.getByText('O plano Singular permite 1 projecto. Para criar mais, mude para o plano Empresarial.')).toBeVisible();

  // Restaurar.
  await page.getByText('Arquivados (1)').click();
  await page.getByRole('link', { name: /Lançamento do produto/ }).click();
  await page.getByRole('button', { name: 'Restaurar projecto' }).click();
  await expect(page.getByRole('heading', { name: 'Arquivar projecto' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Concluída: Validar que existe facto novo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Voltar ao início' }).click();
  await expect(page.getByText('Arquivados (1)')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Lançamento do produto/ })).toBeVisible();
});

test('cancelar a confirmação não arquiva', async ({ page }) => {
  await contaConfirmada(page, 'Katia');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Gala');
  await page.getByLabel('Data do evento').fill(emDias(40));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Arquivar projecto' }).click();
  await expect(page.getByText('Este projecto está arquivado', { exact: false })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Arquivar projecto' })).toBeVisible();
});

test('um leitor vê o projecto mas não o altera; um membro sem acesso não o vê', async ({ browser }) => {
  const dona = await (await browser.newContext()).newPage();
  await contaConfirmada(dona, 'Lurdes');
  await dona.getByRole('button', { name: 'Novo projecto' }).click();
  await dona.getByLabel('Nome do projecto').fill('Projecto partilhado');
  await dona.getByLabel('Data do evento').fill(emDias(40));
  await expect(dona.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await dona.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(dona.getByRole('heading', { name: 'Projecto partilhado' })).toBeVisible();
  const projecto = dona.url().split('/').pop()!;

  const leitor = await (await browser.newContext()).newPage();
  await contaConfirmada(leitor, 'Mario');
  const outro = await (await browser.newContext()).newPage();
  await contaConfirmada(outro, 'Nuno');

  // Os convites chegam no próximo PR: por agora, dar acesso directamente na base de dados de teste.
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  for (const [nome, papel] of [['Mario', 'viewer'], ['Nuno', null]] as const) {
    const { rows } = await cliente.query<{ id: string }>('select id from users where name = $1 order by created_at desc limit 1', [nome]);
    await cliente.query(
      "insert into workspace_members (workspace_id, user_id, role) select workspace_id, $1, 'member' from projects where id = $2",
      [rows[0]!.id, projecto],
    );
    if (papel) await cliente.query('insert into project_members (project_id, user_id, role) values ($1, $2, $3)', [projecto, rows[0]!.id, papel]);
  }
  await cliente.end();

  await leitor.reload();
  await leitor.getByRole('link', { name: /Projecto partilhado/ }).click();
  await expect(leitor.getByText('Tem acesso a este projecto só para consulta.')).toBeVisible();
  await expect(leitor.getByRole('checkbox', { name: 'Concluída: Validar que existe facto novo' })).toBeDisabled();
  await expect(leitor.getByRole('button', { name: 'Arquivar projecto' })).toHaveCount(0);

  await outro.reload();
  await expect(outro.getByRole('link', { name: /Projecto partilhado/ })).toHaveCount(0);
  await outro.goto(`/projectos/${projecto}`);
  await expect(outro.getByRole('alert')).toHaveText('Projecto não encontrado.');
});

test('convidar uma pessoa para a equipa: ligação, criar conta, aceitar e retirar', async ({ browser }) => {
  const dona = await (await browser.newContext()).newPage();
  await contaConfirmada(dona, 'Olga');
  // Plano Empresarial (os pagamentos chegam mais tarde): directamente na base de dados de teste.
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  await cliente.query(
    "update workspaces set plan_code = 'empresarial' where id in (select workspace_id from workspace_members wm join users u on u.id = wm.user_id where u.name = 'Olga')",
  );

  await dona.getByRole('button', { name: 'Equipa' }).click();
  await expect(dona.getByRole('heading', { name: 'Equipa' })).toBeVisible();
  await expect(dona.getByText('1 de 10 pessoas')).toBeVisible();
  const emailConvidado = `paulo.${Date.now()}@exemplo.ao`;
  await dona.getByLabel('E-mail da pessoa').fill(emailConvidado);
  await dona.getByRole('button', { name: 'Criar convite' }).click();
  await expect(dona.getByText('Convite criado')).toBeVisible();
  await expect(dona.getByRole('link', { name: 'Partilhar no WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  const ligacao = (await dona.locator('.ligacao-convite').textContent())!;
  await expect(dona.getByText('2 de 10 pessoas')).toBeVisible();

  // A pessoa abre a ligação sem conta: vê o convite, cria conta e volta ao convite.
  const convidado = await (await browser.newContext()).newPage();
  await convidado.goto(ligacao);
  await expect(convidado.getByText('Olga convidou-o para a equipa «Espaço de Olga» no Eveni.')).toBeVisible();
  await expect(convidado).toHaveURL(/\/convite$/);
  await convidado.getByRole('button', { name: 'Criar conta' }).click();
  await convidado.getByLabel('Nome').fill('Paulo');
  await convidado.getByLabel('E-mail').fill(emailConvidado);
  await convidado.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await convidado.getByRole('button', { name: 'Criar conta' }).click();
  await expect(convidado.getByRole('button', { name: 'Aceitar convite' })).toBeVisible();

  // Sem o e-mail confirmado, não aceita; depois de confirmar, aceita.
  await convidado.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(convidado.getByRole('alert')).toContainText('Confirme o seu e-mail');
  await cliente.query('update users set email_verified_at = now() where email = $1', [emailConvidado]);
  await convidado.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(convidado.getByText('Já faz parte da equipa «Espaço de Olga».', { exact: false })).toBeVisible();
  await convidado.getByRole('button', { name: 'Ir para o início' }).click();
  await expect(convidado.getByRole('heading', { name: 'Olá, Paulo' })).toBeVisible();
  await cliente.end();

  // A dona vê o Paulo na equipa e retira-o.
  await dona.reload();
  // Na lista da equipa (o e-mail também aparece no registo de actividade, mais abaixo).
  await expect(dona.locator('.lista-equipa').getByText(emailConvidado, { exact: true })).toBeVisible();
  await expect(dona.getByRole('heading', { name: 'Convites por aceitar' })).toHaveCount(0);
  dona.once('dialog', (d) => d.accept());
  await dona.getByRole('button', { name: 'Retirar' }).click();
  await expect(dona.locator('.lista-equipa').getByText(emailConvidado, { exact: true })).toHaveCount(0);
  await expect(dona.getByText('1 de 10 pessoas')).toBeVisible();

  // O registo de actividade mostra o que aconteceu.
  const registo = dona.locator('.registo');
  await expect(registo.getByText('Olga retirou Paulo da equipa')).toBeVisible();
  await expect(registo.getByText('Paulo entrou na equipa')).toBeVisible();
  await expect(registo.getByText(`Olga convidou ${emailConvidado} para a equipa`)).toBeVisible();
});

test('no plano Singular, a equipa explica que não há colaboração', async ({ page }) => {
  await contaConfirmada(page, 'Quim');
  await page.getByRole('button', { name: 'Equipa' }).click();
  await expect(page.getByText('O plano Singular não inclui equipa.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar convite' })).toHaveCount(0);
});

test('uma ligação de convite inválida mostra o erro e deixa voltar ao início', async ({ page }) => {
  await contaConfirmada(page, 'Rui');
  await page.goto('/convite?token=ligacao-inventada');
  await expect(page.getByRole('alert')).toContainText('Este convite é inválido');
  await page.getByRole('button', { name: 'Ir para o início' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Rui' })).toBeVisible();
  // A ligação inválida não fica guardada: recarregar o início não leva de volta ao convite.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Olá, Rui' })).toBeVisible();
});

test('o dono dá acesso a um projecto, muda para leitor e retira', async ({ browser }) => {
  const dona = await (await browser.newContext()).newPage();
  await contaConfirmada(dona, 'Sara');
  await dona.getByRole('button', { name: 'Novo projecto' }).click();
  await dona.getByLabel('Nome do projecto').fill('Gala anual');
  await dona.getByLabel('Data do evento').fill(emDias(40));
  await expect(dona.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await dona.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(dona.getByRole('heading', { name: 'Gala anual' })).toBeVisible();
  await expect(dona.getByText('Ainda não há mais ninguém na equipa.', { exact: false })).toBeVisible();

  // O Tiago entra na equipa (o convite já tem o seu próprio teste: aqui, directamente na base de dados).
  const membro = await (await browser.newContext()).newPage();
  await contaConfirmada(membro, 'Tiago');
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  const projecto = dona.url().split('/').pop()!;
  await cliente.query(
    `insert into workspace_members (workspace_id, user_id, role)
     select p.workspace_id, (select id from users where name = 'Tiago' order by created_at desc limit 1), 'member'
       from projects p where p.id = $1`,
    [projecto],
  );
  await cliente.end();

  // Dar acesso de editor.
  await dona.reload();
  await dona.getByLabel('Pessoa', { exact: true }).selectOption({ label: 'Tiago' });
  await dona.getByLabel('Acesso', { exact: true }).selectOption({ label: 'Editor' });
  await dona.getByRole('button', { name: 'Dar acesso' }).click();
  await expect(dona.getByLabel('Acesso: Tiago')).toHaveValue('editor');
  await expect(dona.getByText('Todas as pessoas da equipa já têm acesso a este projecto.')).toBeVisible();

  await membro.reload();
  await membro.getByRole('link', { name: /Gala anual/ }).click();
  await membro.getByRole('checkbox', { name: 'Concluída: Validar que existe facto novo' }).check();
  await expect(membro.getByText('1 de 47 tarefas concluídas')).toBeVisible();

  // Passar a leitor (pede confirmação, porque lhe retira as tarefas).
  dona.once('dialog', (d) => d.accept());
  await dona.getByLabel('Acesso: Tiago').selectOption({ label: 'Leitor' });
  await expect(dona.getByLabel('Acesso: Tiago')).toHaveValue('viewer');
  await membro.reload();
  await expect(membro.getByText('Tem acesso a este projecto só para consulta.')).toBeVisible();
  await expect(membro.getByRole('checkbox', { name: 'Concluída: Validar que existe facto novo' })).toBeDisabled();

  // Retirar.
  dona.once('dialog', (d) => d.accept());
  await dona.getByRole('button', { name: 'Retirar acesso' }).click();
  await expect(dona.getByLabel('Acesso: Tiago')).toHaveCount(0);
  await membro.reload();
  await expect(membro.getByRole('alert')).toHaveText('Projecto não encontrado.');
});
