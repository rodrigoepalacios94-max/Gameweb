1 – INTRODUCCIÓN
1.1 Objetivo del sistema
GAME es una plataforma web destinada a la administración integral de torneos de tenis.
Su objetivo principal es automatizar la mayor cantidad posible de tareas que actualmente realiza el profesor de forma manual, permitiendo administrar torneos desde la inscripción de los jugadores hasta la actualización automática del ranking.
El sistema busca reducir tiempos de organización, minimizar errores humanos y ofrecer una mejor experiencia tanto para jugadores como para administradores.

1.2 Objetivos
GAME deberá permitir:
•	Automatizar el armado de torneos. 
•	Reducir el trabajo administrativo. 
•	Mantener actualizado el ranking. 
•	Organizar automáticamente las llaves. 
•	Administrar múltiples categorías simultáneamente. 
•	Programar partidos considerando disponibilidad de jugadores. 
•	Gestionar varios fines de semana de competencia. 
•	Publicar resultados en tiempo real. 
•	Centralizar toda la información del circuito. 


2 – Arquitectura generasl
2.1 Tipos de usuario
El sistema contará inicialmente con dos perfiles.
Jugador
Participa de los torneos.
Profesor / Administrador
Administra completamente el circuito.

2.2 Arquitectura funcional
El sistema estará dividido en módulos independientes.
•	Usuarios 
•	Jugadores 
•	Categorías 
•	Ranking 
•	Torneos 
•	Inscripciones 
•	Pagos 
•	Programación 
•	Llaves 
•	Partidos 
•	Resultados 
•	Estadísticas 
•	Sistema disciplinario 
•	Configuración 
•	Notificaciones 
________________________________________
2.3 Principios de diseño

Las acciones automáticas podrán ser modificadas manualmente únicamente cuando la funcionalidad correspondiente lo permita y sin violar las reglas deportivas obligatorias definidas por el sistema.

Las reglas estructurales de los formatos de torneo deberán respetar siempre lo establecido en:

docs/formatos.md

Nunca existirán procesos irreversibles sin confirmación.

Toda modificación importante deberá quedar registrada en un historial de auditoría.


3 – Jugadores
3.1 Registro
Cada jugador deberá registrarse mediante:
•	Nombre 
•	Apellido 
•	DNI 
•	Fecha de nacimiento 
•	Sexo 
•	Teléfono 
•	Correo electrónico 
•	Contraseña 
•	Categoría

3.2 Perfil
Cada jugador tendrá un perfil único.
El perfil contendrá:
Información personal.
Podra subir su foto de perfil (la cual se vera en los torneos, en las llaves como miniatura)
Categoría actual.
Ranking General.
Historial de torneos.
Historial de partidos.
Estadísticas.
Estado disciplinario.

3.3 Categoría
Cada jugador posee una única categoría vigente.
Ejemplo:
•	Segunda 
•	Tercera 
•	Cuarta 
•	Quinta 
•	Sexta 
Las categorías son administradas únicamente por el profesor.
________________________________________
3.4 Inscripción en categorías
El jugador podrá inscribirse en:
Su categoría.
Categorías superiores.
Nunca podrá inscribirse directamente en una categoría inferior.
________________________________________
3.5 Solicitud de descenso
Si un jugador intenta anotarse en una categoría inferior aparecerá el siguiente mensaje:
No podés inscribirte en una categoría inferior a tu categoría actual.
¿Deseás solicitar un descenso de categoría?
Opciones:
•	Solicitar descenso. 
•	Cancelar. 
La solicitud quedará pendiente hasta que el profesor la apruebe o rechace.


3.6 Doble categoría
Un jugador podrá disputar más de una categoría dentro del mismo torneo.
Ejemplo:
•	Tercera. 
•	Segunda. 
El sistema deberá detectar cuando ambas categorías se disputen el mismo día y advertir al jugador antes de confirmar la inscripción.

3.7 Disponibilidad
La disponibilidad no se solicita durante la inscripción al torneo.
Cada partido futuro o pendiente genera su propia solicitud de confirmación de asistencia.
El jugador confirma que disputará ese partido e informa solamente los horarios en los que NO puede jugar.
Todos los horarios no marcados se consideran potencialmente disponibles.
La disponibilidad pertenece exclusivamente a ese partido específico.
Cada nuevo partido requiere una nueva confirmación.

3.8 Estado del jugador
Un jugador podrá encontrarse en alguno de los siguientes estados:
•	Activo. 
•	Suspendido. 
•	Bloqueado por faltas.


4 – Administrador
El profesor tendrá acceso completo al sistema.
Podrá administrar todos los módulos.
4.1 Dashboard
El panel principal mostrará:
Próximos torneos.
Partidos pendientes.
Inscripciones.
Solicitudes de descenso.
Jugadores bloqueados.
Notificaciones.
Estado del ranking

4.2 Gestión de jugadores

El profesor podrá:

- Cambiar categoría.
- Ajustar puntos del ranking con motivo obligatorio.
- Bloquear jugadores.
- Desbloquear jugadores.
- Consultar historial.

La posición del ranking no podrá modificarse manualmente.

Cuando el profesor realice un ajuste de puntos, GAME deberá recalcular automáticamente la posición correspondiente del jugador.

4.3 Gestión de torneos
Crear.
Editar.
Cancelar.
Finalizar.

4.4 Gestión de resultados
El profesor podrá:
Registrar resultados.
Editar resultados.
Registrar W.O.
Registrar faltas.
Reprogramar partidos.

4.5 Gestión disciplinaria
Podrá:
Confirmar reclamos.
Aplicar faltas.
Bloquear jugadores.
Desbloquear jugadores.
Consultar historial disciplinario.

4.6 Configuración
Acceso a:
Categorías.
Puntajes.
Tipos de torneo.
Horarios.
Canchas.
Reglamentos.
Notificaciones.


5 – Configuración
Toda la configuración general del circuito será administrada desde un único módulo.
Los cambios impactarán en todos los torneos futuros.
5.1 Categorías
Las categorías serán completamente configurables por el profesor.
Cada categoría tendrá como mínimo los siguientes campos:
•	Nombre. 
•	Rama (Masculino / Femenino). 
•	Nivel jerárquico. 
•	Estado (Activa/Inactiva). 

El sistema utilizará el Nivel Jerárquico para determinar automáticamente si un jugador puede inscribirse en otra categoría.
No se basará en el nombre.
Por ejemplo, si un club utiliza:
•	Primera A 
•	Primera B 
•	Intermedia 
•	Promocional 

el sistema seguirá funcionando correctamente porque la comparación se realizará mediante el nivel configurado.

5.1.2 Restricciones de inscripción
El sistema aplicará las siguientes reglas automáticamente:
✅ Puede jugar su misma categoría.
✅ Puede jugar categorías superiores.
❌ No puede jugar categorías inferiores.
En caso de intentar hacerlo:
No podés inscribirte en una categoría inferior.
¿Deseás solicitar un descenso de categoría?
La solicitud quedará pendiente hasta la decisión del profesor.

5.1.3 Cambio de categoría
El profesor podrá modificar la categoría de un jugador en cualquier momento.
El cambio quedará registrado indicando:
•	Categoría anterior. 
•	Nueva categoría. 
•	Fecha. 
•	Motivo (opcional).


5.3 Sistema de puntajes
El profesor podrá configurar distintos tipos de puntuación.
Ejemplo:
GAME 1000.
MASTER GAME 1500.
Cada tipo permitirá definir:
•	Puntos por inscripción. 
•	Puntos por disputar la preliminar. 
•	Bonus por ganar la preliminar. 
•	Puntos por cada ronda alcanzada. 
•	Puntos para subcampeón. 
•	Puntos para campeón. 

5.4 Horarios
El profesor configurará los turnos disponibles.

5.5 Canchas
Se configurará la cantidad de canchas disponibles.
El algoritmo utilizará esta información para distribuir automáticamente los partidos.

5.6 Reglamentos
El profesor podrá publicar el reglamento oficial del circuito.
El jugador podrá consultarlo desde su perfil.

5.7 Parámetros disciplinarios
Configuración de:
•	Cantidad máxima de faltas permitidas. 
•	Acciones automáticas al alcanzar el límite. 
•	Reglas para W.O. 
•	Reglas para doble W.O. 
________________________________________
5.8 Notificaciones
Configuración de:
•	Correos electrónicos. 
•	Avisos internos del sistema.


6. Torneos
6.1 Concepto de Torneo
Un torneo representa una competencia organizada por GAME, donde participan una o varias categorías bajo un formato determinado.
Cada torneo será completamente independiente de los demás, conservando su propio historial, cuadros, resultados y estadísticas.

6.2 Información general
Cada torneo tendrá como mínimo los siguientes datos:
•	Nombre. 
•	Descripción (opcional). 
•	Fecha de inicio. 
•	Fecha del Día de Finales. 
•	Fecha prevista para semifinales. 
•	Estado. 
•	Sistema de puntaje. 
•	Valor de inscripción. 
•	Categorías participantes. 
•	Reglamento específico (opcional). 
•	Cantidad máxima de jugadores por categoría (opcional). 
•	Observaciones internas. 
________________________________________
6.3 Estados del torneo
Un torneo podrá encontrarse en uno de los siguientes estados:
•	Borrador. 
•	Inscripciones abiertas. 
•	Inscripciones cerradas. 
•	En programación. 
•	En juego. 
•	Finalizado. 
•	Cancelado. 
Cada estado habilitará o bloqueará determinadas acciones.
Ejemplo:
Mientras las inscripciones estén abiertas se podrán agregar jugadores.
Una vez cerradas ya no será posible inscribirse salvo autorización manual del profesor.

6.4 Creación

El profesor deberá completar un asistente de creación.

Paso 1
Información general.

Paso 2
Seleccionar categorías.

Paso 3
Seleccionar el formato de torneo para cada categoría:

- Preliminares.
- Zonas.
- Eliminación Directa.

Las reglas deportivas y estructuras correspondientes a cada formato se encuentran definidas en:

docs/formatos.md

GAME debe utilizar dicho archivo como fuente oficial para determinar la estructura correspondiente según el formato seleccionado y la cantidad de jugadores.

Paso 4
Configurar formato del partido:

- Cantidad de sets.
- Games por set.
- Uso de Super Tie-Break.

Paso 5
Seleccionar sistema de puntaje.

Paso 6
Definir canchas y horarios.

Paso 7
Publicar torneo.


6.5 Edición
Mientras el torneo no haya comenzado podrán modificarse todos los datos.
Una vez iniciado solamente podrán editarse:
•	Horarios. 
•	Canchas. 
•	Fechas. 
•	Reglamentos. 
•	Resultados (con permisos). 
•	
Nunca podrán modificarse las categorías una vez iniciado.

6.6 Cancelación
Un torneo podrá cancelarse antes o durante su desarrollo.
El sistema conservará toda la información histórica.
Nunca eliminará datos.


7. Inscripciones
7.1 Apertura
El profesor decide cuándo abrir y cerrar las inscripciones.

7.2 Flujo del jugador
El jugador:
Selecciona torneo.
↓
Selecciona categoría.
↓
Realiza el pago.
↓
Confirma inscripción.
↓
Recibe comprobante.

7.3 Disponibilidad
La disponibilidad no se carga durante la inscripción.
Cuando GAME conoce que un jugador tiene un próximo partido, el sistema solicita confirmar asistencia para ese partido.
El jugador marca únicamente los horarios en los que NO puede jugar, usando los horarios configurados por el profesor para el torneo.
Todos los horarios no marcados se consideran disponibles.
La disponibilidad se guarda por partido y no como disponibilidad global del jugador.

7.4 Doble categoría
Si un jugador se inscribe en dos categorías, el sistema advertirá posibles conflictos. Posteriormente el cronograma intentará evitar superposiciones.

7.5 Pago
La inscripción quedará pendiente hasta recibir la confirmación del pago mediante Mercado Pago.
7.6 Cupos
Cada categoría podrá tener:
•	Cupo ilimitado. 
•	Cupo máximo. 
Si se completa el cupo:
Los nuevos jugadores quedarán en lista de espera.

7.7 Baja de inscripción
El profesor podrá eliminar una inscripción antes del comienzo del torneo.
El sistema registrará el motivo.
8. Sistema de ranking
8.1 Objetivo
El ranking refleja el rendimiento deportivo de cada jugador dentro del circuito GAME.

8.2 Tipos de ranking

El sistema administrará rankings generales del circuito y, cuando corresponda, rankings temporales asociados a una competencia.

### Ranking General

Representa el ranking activo correspondiente al año deportivo vigente.

Se utiliza para:

- Cabezas de serie.
- Desempates.
- BYE por Ranking General cuando docs/formatos.md lo establezca expresamente.
- Otras condiciones expresamente establecidas en las reglas del sistema.

Los jugadores comienzan cada nuevo año deportivo con 0 puntos.

Los jugadores con 0 puntos no aparecen inicialmente en el Ranking General activo y comienzan a incorporarse a medida que obtienen puntos durante el año.

### Inicio de una nueva temporada

Al comenzar un nuevo año deportivo, todos los jugadores iniciarán el Ranking General de la temporada vigente con 0 puntos.

Sin embargo, mientras no se haya disputado el primer torneo oficial del año en una categoría, GAME utilizará el Ranking General de la temporada anterior para todas las reglas que dependan del orden deportivo de los jugadores.

Esto incluye, entre otras:

- Determinación de cabezas de serie.
- Asignación de BYE.
- Sorteos que utilicen el Ranking General.
- Cualquier otra regla definida en docs/formatos.md que requiera utilizar el Ranking General.

Una vez finalizado el primer torneo oficial de la temporada en esa categoría, GAME dejará de utilizar el Ranking General de la temporada anterior y utilizará exclusivamente el Ranking General de la temporada vigente.

### Jugadores promovidos de categoría

Cuando un jugador ascienda de categoría para una nueva temporada, comenzará con 0 puntos en el Ranking General de su nueva categoría.

Si dicho jugador no posee historial en esa categoría durante la temporada anterior, GAME lo considerará con 0 puntos también para las reglas que utilicen el Ranking General de la temporada anterior.

En consecuencia, no tendrá prioridad sobre los jugadores que sí posean puntos en esa categoría y participará en la asignación de cabezas de serie, BYE y demás reglas deportivas según la posición que le corresponda con ese puntaje.

### Ranking por Categoría

Muestra la clasificación de los jugadores correspondiente a cada categoría.

La clasificación se determina según los puntos obtenidos por los jugadores y las reglas de categoría establecidas por GAME.

### Ranking Histórico

Conserva la información correspondiente a rankings y puntos de temporadas anteriores.

La información histórica no debe eliminarse cuando comienza un nuevo año deportivo.

El profesor podrá realizar ajustes de puntos cuando corresponda, siempre respetando las reglas de auditoría y registrando el motivo.

### Ranking de Preliminares

Cuando una categoría utiliza el formato Preliminares, GAME debe generar un Ranking de Preliminares correspondiente exclusivamente a esa categoría y a ese torneo.

Este ranking es temporal y competitivo dentro del torneo.

No forma parte del Ranking General anual ni del Ranking Histórico general.

Se utiliza para ordenar el rendimiento obtenido en preliminares y resolver las condiciones establecidas en:

docs/formatos.md

Entre ellas:

- Mejores ganadores.
- Peores ganadores.
- Mejores perdedores.
- Peores perdedores.
- Clasificaciones directas.
- BYE determinados por rendimiento de preliminares.
- Participación en rondas adicionales.

El Ranking de Preliminares y el Ranking General deben mantenerse siempre separados.

Cuando docs/formatos.md indique expresamente que una decisión debe tomarse utilizando el Ranking General, GAME no podrá utilizar el Ranking de Preliminares.

Cuando docs/formatos.md indique expresamente que una decisión debe tomarse utilizando el Ranking de Preliminares, GAME no podrá utilizar el Ranking General.

8.3 Obtención de puntos
Los puntos se obtendrán según la tabla configurada para cada torneo.
Conceptos posibles:
•	Participación. 
•	Inscripción. 
•	Jugar preliminar. 
•	Ganar preliminar. 
•	Clasificar. 
•	Octavos. 
•	Cuartos. 
•	Semifinal. 
•	Final. 
•	Campeón. 

8.4 Historial
Cada movimiento quedará registrado.
Ejemplo:
Jugador: Sebastian Gallardo
Torneo: GAME 1000
Concepto: Ganó Cuartos
Puntos: +120
Fecha

8.5 Ajustes manuales
El profesor podrá agregar, descontar o modificar puntos, siempre indicando el motivo.

8.6 Actualización
El ranking se actualizará automáticamente cada vez que finalice un partido.
No será necesario recalcular manualmente.

9. Sistema de puntajes
9.1 Configuración
Cada tipo de torneo tendrá su propia tabla.
Ejemplo:
GAME 250
GAME 500
GAME 1000
MASTER GAME 1500

9.2 Conceptos puntuables
El profesor podrá definir:
Puntos por inscripción.
Puntos por jugar la preliminar.
Bonus por ganar la preliminar.
Puntos por clasificación.
Puntos por cada ronda.
Puntos por campeón.
Puntos por subcampeón.
Bonus especiales.

9.3 Acumulación
Los puntos serán acumulativos.
Puntaje total del torneo
Estos puntos de cada torneo se sumarán al ranking general del jugador

9.4 Penalizaciones
También podrán descontarse puntos por:
W.O.
Sanciones disciplinarias.
Abandono.
Otras reglas configurables.

9.5 Historial
Todo movimiento quedará registrado.
Nunca se perderá información.


12. Programación inteligente
12.1 Objetivo
El sistema deberá distribuir automáticamente todos los partidos del torneo considerando las reglas deportivas y la disponibilidad de infraestructura.
El profesor únicamente definirá:
•	Fechas disponibles. 
•	Horarios. 
•	Canchas. 
•	Día de las finales. 
•	(Opcional) Día de semifinales. 
GAME organizará el resto.
________________________________________
12.2 Variables consideradas
El algoritmo tendrá en cuenta:
•	Disponibilidad del jugador. 
•	Cantidad de canchas. 
•	Cantidad de turnos. 
•	Categoría. 
•	Doble inscripción. 
•	Descanso entre partidos. 
•	Fase del torneo. 
•	Fecha de semifinales. 
•	Fecha de finales. 

12.3 Prioridad deportiva
La prioridad del algoritmo será:
1.	Todas las finales deben disputarse el mismo día. 
2.	Las semifinales deben jugarse lo más cerca posible de las finales. 
3.  Si una categoría debe esperar, se retrasarán prioritariamente las instancias anteriores de la competencia y no las instancias decisivas, respetando siempre la estructura específica de la categoría y su formato.
4.	Evitar que un jugador dispute dos partidos al mismo horario. 
5.	Evitar que un jugador tenga tiempos de espera excesivos entre partidos de una misma jornada. 

12.4 Reprogramación
El profesor podrá modificar manualmente cualquier partido.
Al hacerlo, el sistema verificará automáticamente:
•	Conflictos de horarios. 
•	Conflictos de canchas. 
•	Superposición de jugadores. 
•	Descansos insuficientes. 
Si detecta algún conflicto, emitirá una advertencia, pero permitirá guardar el cambio bajo responsabilidad del profesor.

12.5 Lluvia y suspensión
Si una jornada se suspende por lluvia u otra causa, el profesor podrá marcarla como suspendida.
El sistema ofrecerá reprogramar automáticamente los partidos pendientes utilizando los turnos disponibles posteriores.
No se modificarán los partidos ya disputados.

13. Partidos
13.1 Estados
Cada partido podrá encontrarse en alguno de los siguientes estados:
•	Pendiente. 
•	Programado. 
•	En juego. 
•	Finalizado. 
•	Suspendido. 
•	Pausado
•	Reprogramado. 
•	W.O. 
•	Doble W.O. 

13.2 Información del partido
Cada partido almacenará:
•	Jugador A. 
•	Jugador B. 
•	Categoría. 
•	Ronda. 
•	Cancha. 
•	Fecha. 
•	Hora. 
•	Resultado. 
•	Estado. 
•	Observaciones. 

13.3 Carga de resultado
Al finalizar un partido, el profesor ingresará:
•	Sets. 
•	Games 
•	Super tie-break (si corresponde). 
El sistema determinará automáticamente el ganador.
________________________________________
13.4 W.O.
El profesor podrá indicar:
•	W.O. del jugador A. 
•	W.O. del jugador B. 
•	Doble W.O. 

El sistema actualizará automáticamente la llave y asignará los puntos según la configuración del torneo.

13.5 Edición
Los resultados podrán corregirse únicamente por el profesor.
Toda modificación quedará registrada en un historial de auditoría.


14. Sistema disciplinario
14.1 Objetivo
GAME incorporará un sistema disciplinario para registrar y administrar faltas ocurridas durante los partidos.
Como los encuentros se disputan sin árbitro permanente, las sanciones serán administradas por el profesor.

14.2 Reclamos
Durante o después de un partido, un jugador podrá informar una conducta antideportiva.
El reclamo quedará pendiente hasta su revisión.

14.3 Confirmación
El profesor decidirá si el reclamo es:
•	Confirmado. 
•	Rechazado. 
Solo los reclamos confirmados generarán una falta.

14.4 Registro de faltas
Cada falta almacenará:
•	Partido. 
•	Jugador sancionado. 
•	Jugador reclamante. 
•	Motivo. 
•	Observaciones. 
•	Fecha. 
•	Profesor responsable. 

14.5 Límite
Cada jugador podrá acumular hasta 3 faltas confirmadas.
Al alcanzar ese límite:
•	Será expulsado del torneo actual. 
•	No podrá inscribirse a nuevos torneos. 
•	Su cuenta quedará bloqueada hasta que el profesor la rehabilite. 

14.6 Estados disciplinarios
Los posibles estados serán:
•	Sin sanciones. 
•	Advertido. 
•	Suspendido del torneo. 
•	Bloqueado. 

14.7 Desbloqueo
Solo el profesor podrá rehabilitar a un jugador.
El sistema registrará:
•	Fecha. 
•	Profesor. 
•	Motivo. 
•	Observaciones. 
15. Notificaciones
15.1 Objetivo
Mantener informados a jugadores y profesor sobre todos los eventos relevantes del torneo.

15.2 Notificaciones al jugador
El jugador recibirá avisos cuando:
•	Se confirme su inscripción. 
•	Se programe un partido. 
•	Se modifique un horario. 
•	Se modifique una cancha. 
•	Reciba una falta disciplinaria. 
•	Su solicitud de descenso sea aceptada o rechazada. 
•	Sea bloqueado o desbloqueado. 

15.3 Notificaciones al profesor
El profesor recibirá avisos cuando:
•	Se solicite un descenso de categoría. 
•	Se registre un reclamo disciplinario. 
•	Un jugador alcance el límite de faltas. 
•	Existan conflictos de programación. 
•	Haya partidos pendientes de cargar. 

15.4 Canales
Las notificaciones podrán enviarse mediante:
•	Avisos dentro de GAME. 
•	Correo electrónico para eventos importantes. 
.


16. Reglas
Las siguientes reglas son obligatorias para el funcionamiento del sistema.

16.1 Jugadores
Un jugador podrá pertenecer únicamente a una categoría vigente.
Podrá participar en:
•	Su categoría. 
•	Categorías superiores. 
Nunca podrá inscribirse directamente en una categoría inferior.

16.2 Descenso de categoría
Si un jugador desea jugar una categoría inferior:
El sistema generará una solicitud.
Hasta que el profesor no la apruebe:
La inscripción permanecerá bloqueada.

16.3 Ranking General y formatos

El Ranking General podrá utilizarse para:

• Determinar cabezas de serie.
• Distribuir a los principales cabezas de serie dentro de la llave.
• Resolver los BYE por Ranking General cuando la regla específica del formato y cantidad de jugadores así lo indique.
• Resolver otros casos expresamente establecidos en docs/formatos.md.

El Ranking General nunca debe confundirse con el Ranking de Preliminares.

Las reglas específicas que determinan cuándo corresponde utilizar Ranking General o Ranking de Preliminares se encuentran definidas en:

docs/formatos.md

GAME no debe otorgar, eliminar ni modificar BYE basándose en reglas generales diferentes a las establecidas en dicho archivo.


16.4 BYE

Los BYE deben asignarse exclusivamente según las reglas específicas establecidas en:

docs/formatos.md

Dependiendo del formato y de la cantidad de jugadores, un BYE podrá determinarse mediante:

• Ranking General.
• Ranking de Preliminares.
• Otra condición expresamente establecida en las reglas específicas del formato.

GAME no debe asumir que todos los BYE corresponden al Ranking General ni que todos corresponden al Ranking de Preliminares.

Cuando docs/formatos.md indique expresamente "BYE por Ranking General", deberá utilizarse el Ranking General.

Cuando docs/formatos.md indique expresamente un BYE determinado por rendimiento o Ranking de Preliminares, deberá utilizarse exclusivamente el Ranking de Preliminares.

Todo BYE debe respetar además las reglas administrativas y deportivas definidas en docs/formatos.md.


16.5 Cabezas de serie

Los cabezas de serie se determinan utilizando el Ranking General de la categoría.

Durante el sorteo de preliminares, los cabezas de serie no pueden enfrentarse entre sí.

Al generar posteriormente una llave eliminatoria, los principales cabezas de serie deben distribuirse en lados opuestos de la llave siempre que sea matemáticamente posible.

La condición de cabeza de serie se mantiene independientemente del resultado obtenido en preliminares.

Por lo tanto, un cabeza de serie que pierda su preliminar continúa siendo cabeza de serie mientras permanezca en competencia, pero también conserva su condición de Perdedor de Preliminar para la aplicación de las reglas de armado de la llave.

Las reglas completas de protección, distribución y excepciones matemáticas se encuentran definidas en:

docs/formatos.md

16.6 Programación

La prioridad del sistema será siempre preservar las instancias decisivas del torneo.

Orden general de prioridad:

1. Final.
2. Semifinales.
3. Cuartos de final.
4. 8vos.
5. 16avos.
6. 32avos.
7. Preliminares.

Solo deben considerarse las instancias que efectivamente existan según el formato y la cantidad de jugadores definidos en docs/formatos.md.

Nunca deberá dejarse una semifinal excesivamente alejada de la final cuando exista una alternativa válida de programación.



## REGLAS DE W.O. Y CÓMPUTO DE RESULTADOS

Cuando un partido se define por W.O. (Walkover), el resultado debe computarse automáticamente como un resultado deportivo de 6-0 / 6-0.

### Jugador ganador por W.O.

El jugador que gana el partido por W.O. debe registrar, a efectos de cálculos deportivos y estadísticos, el siguiente resultado:

- Set 1: 6-0 a favor.
- Set 2: 6-0 a favor.
- Resultado computable: victoria 6-0 / 6-0.

Este resultado debe utilizarse normalmente para todos los cálculos posteriores que dependan del rendimiento obtenido en el torneo.

Por ejemplo, si el formato del torneo utiliza resultados previos para ordenar o clasificar jugadores, el ganador por W.O. debe ser considerado como si hubiera obtenido una victoria por 6-0 / 6-0.

### Jugador perdedor por W.O.

El jugador que pierde el partido por no presentarse debe registrar, a efectos de cálculos deportivos y estadísticos, el siguiente resultado:

- Set 1: 0-6 en contra.
- Set 2: 0-6 en contra.
- Resultado computable: derrota 0-6 / 0-6.

Este resultado debe afectar normalmente los cálculos posteriores que dependan del rendimiento obtenido.

Por ejemplo, si después de una etapa preliminar es necesario ordenar a los jugadores perdedores para determinar cuáles clasifican directamente y cuáles deben disputar una ronda adicional, una derrota por W.O. debe computarse como 0-6 / 0-6 y, por lo tanto, posicionar al jugador entre los peores resultados según corresponda.

La misma regla debe aplicarse en formatos de torneo por zonas cuando sea necesario calcular posiciones, rendimiento, games ganados, games perdidos u otros criterios derivados de los resultados.

El W.O. debe quedar registrado explícitamente como W.O. en el historial y detalle del partido, aunque para los cálculos deportivos internos se compute como 6-0 / 6-0 a favor del ganador y 0-6 / 0-6 para el jugador que no se presentó.


## CATEGORÍAS DE LOS JUGADORES

Cada jugador debe tener asignada una categoría vigente.

La categoría vigente representa la categoría mínima en la que el jugador puede competir normalmente.

Durante el año, un jugador puede inscribirse y participar tanto en:

- Su categoría vigente.
- Categorías superiores a su categoría vigente.

Esto permite que un jugador pueda competir durante el año en categorías superiores para probar su nivel y competir contra jugadores de mayor categoría.

Un jugador no puede inscribirse libremente en una categoría inferior a su categoría vigente.


## RANKING GLOBAL ANUAL

GAME debe mantener un Ranking Global correspondiente al año deportivo en curso.

El Ranking Global representa los puntos acumulados por los jugadores durante todos los torneos disputados a lo largo del año.

Los jugadores comienzan cada nuevo año deportivo con 0 puntos.

Al comenzar un nuevo año:

- El Ranking Global del año anterior se cierra.
- Los puntos utilizados para el Ranking Global activo se reinician a 0.
- El nuevo Ranking Global comienza vacío.
- Los jugadores que tienen 0 puntos no deben aparecer inicialmente en el Ranking Global.
- Los jugadores comienzan a aparecer en el Ranking Global a medida que obtienen sus primeros puntos durante el nuevo año deportivo.

Esto evita mostrar una clasificación artificial entre jugadores que todavía tienen todos 0 puntos y para los cuales no existe un criterio deportivo que permita establecer una posición real.

Por lo tanto, al comenzar el año el Ranking Global no muestra ningún jugador.

A medida que se disputan torneos y los jugadores obtienen puntos, comienzan a incorporarse automáticamente al Ranking Global y se ordenan según los puntos acumulados durante ese año.

El Ranking Global debe representar exclusivamente la temporada o año deportivo vigente.


## CIERRE ANUAL DEL RANKING Y ASCENSOS DE CATEGORÍA

Al finalizar el año deportivo se debe cerrar el Ranking Global correspondiente a ese año.

El jugador que finalice con la mayor cantidad de puntos en el Ranking Global de cada categoría debe ascender automáticamente a la categoría inmediatamente superior.

El ascenso se determina utilizando la categoría vigente del jugador y su posición dentro del Ranking Global correspondiente a dicha categoría.

Ejemplo:

- Un jugador tiene como categoría vigente la Categoría 3.
- Durante el año puede competir en Categoría 3 y también participar en torneos de Categoría 2 o categorías superiores.
- Al finalizar el año, si es el jugador con mayor cantidad de puntos del Ranking Global correspondiente a su categoría, asciende automáticamente.
- Su nueva categoría vigente pasa a ser Categoría 2.
- A partir del nuevo año deportivo ya no puede volver a competir normalmente en Categoría 3.

El ascenso modifica oficialmente la categoría vigente del jugador.

Una vez aplicado el ascenso, el jugador comienza el nuevo año con:

- Su nueva categoría vigente.
- 0 puntos en el nuevo Ranking Global.
- Sin posición visible en el Ranking Global hasta que obtenga sus primeros puntos del nuevo año.

El Ranking Global del año anterior debe conservarse únicamente como historial, si el sistema dispone de una sección de temporadas o rankings históricos, pero sus puntos no deben trasladarse al Ranking Global del nuevo año.


## PARTICIPACIÓN EN CATEGORÍAS SUPERIORES

Durante el año, un jugador puede competir en categorías superiores a su categoría vigente sin que esto modifique automáticamente su categoría oficial.

Ejemplo:

Un jugador cuya categoría vigente es Categoría 3 puede:

- Jugar torneos de Categoría 3.
- Jugar torneos de Categoría 2.
- Jugar torneos de Categoría 1, si corresponde según la jerarquía configurada.

Participar en una categoría superior durante el año no implica automáticamente un cambio de categoría.

La categoría vigente solo cambia mediante:

- Ascenso automático al finalizar el año.
- Descenso aprobado por el profesor/administrador.


## SOLICITUD DE DESCENSO DE CATEGORÍA

Si un jugador considera que debe regresar a una categoría inferior a su categoría vigente, debe realizar una solicitud formal de descenso de categoría desde el sistema.

El descenso nunca debe realizarse automáticamente ni por decisión unilateral del jugador.

La solicitud debe ser revisada por el profesor/administrador.

Hasta que la solicitud sea aprobada:

- El jugador mantiene su categoría vigente.
- No puede inscribirse en categorías inferiores.
- Puede continuar jugando en su categoría vigente o en categorías superiores.

Si el profesor/administrador aprueba la solicitud:

- Se actualiza la categoría vigente del jugador.
- A partir de ese momento puede competir en la nueva categoría asignada.
- El cambio debe quedar registrado en el historial del jugador.

Si la solicitud es rechazada:

- El jugador conserva su categoría vigente actual.


## REGLA GENERAL DE PARTICIPACIÓN POR CATEGORÍA

La validación de inscripción a un torneo siempre debe realizarse utilizando la categoría vigente del jugador al momento de la inscripción.

El sistema debe permitir:

- Categoría vigente: SÍ.
- Categorías superiores: SÍ.
- Categorías inferiores: NO, salvo que previamente exista una solicitud de descenso aprobada que haya actualizado oficialmente la categoría vigente del jugador.

Los ascensos anuales deben procesarse al finalizar el año deportivo y antes del inicio efectivo de la nueva temporada.

Después de procesar los ascensos:

1. Se actualizan las categorías vigentes de los jugadores que correspondan.
2. Se cierra el Ranking Global del año finalizado.
3. Se inicia el nuevo Ranking Global con todos los jugadores en 0 puntos.
4. El Ranking Global visible comienza vacío.
5. Los jugadores se incorporan nuevamente al ranking a medida que obtienen puntos durante el nuevo año.

## CELEBRACIÓN DE ASCENSO DE CATEGORÍA

Cuando un jugador ascienda de categoría como consecuencia del cierre anual del Ranking Global, el sistema deberá registrar que existe un ascenso pendiente de comunicar.

La primera vez que el jugador ingrese a GAME durante el nuevo año deportivo, deberá mostrarse una pantalla especial de celebración antes de acceder normalmente a su panel.

La pantalla deberá comunicar claramente:

- Que el jugador ascendió de categoría.
- Su categoría anterior.
- Su nueva categoría vigente.

Ejemplo:

¡FELICITACIONES!

ASCENDISTE DE CATEGORÍA

Ahora sos Categoría 2

La experiencia podrá incluir una animación visual especial acorde con la identidad de GAME.

El mensaje deberá mostrarse una sola vez.

Una vez que el jugador confirme o cierre la celebración, el sistema deberá registrar que la notificación de ascenso ya fue visualizada y no deberá volver a mostrarse en futuros inicios de sesión.

El ascenso ya debe haber sido aplicado previamente a la categoría vigente del jugador. La pantalla tiene una función exclusivamente informativa y de celebración, y no requiere aceptación por parte del jugador.


## DETALLE ADMINISTRATIVO DE TORNEO POR CATEGORIA

En el detalle administrativo de un torneo, el selector de categoria ubicado arriba de la navegacion define el alcance de las secciones principales visibles.

La navegacion principal del detalle debe mantenerse acotada a:

- Cuadro.
- Partidos.
- Participantes.
- Programacion.
- Disciplina.

No deben existir pestanas principales permanentes de Formatos, Inscripciones o Resumen.

La informacion de resumen del torneo debe vivir en el encabezado y en la configuracion administrativa del torneo.


Las secciones Cuadro, Partidos, Participantes, Programacion y Disciplina deben mostrar datos de la categoria seleccionada, sin mezclar informacion de otras categorias del mismo torneo.

Las suspensiones de resto de jornada y fin de semana se ejecutan desde Ajustes o desde Programacion, siempre con confirmacion visual del sistema antes de aplicar las reglas existentes de suspension y reprogramacion.

La accion Finalizar torneo debe estar visible en el encabezado como accion critica. Si quedan partidos sin finalizar, GAME debe mostrar una confirmacion explicita indicando la cantidad de partidos pendientes. Si el profesor confirma, el torneo puede cerrarse igualmente, sin inventar resultados ni modificar automaticamente partidos pendientes.


## CONFIGURACION ADMINISTRATIVA FINAL

Configuracion debe concentrar solamente parametros globales reales del circuito:

- Categorias.
- Puntajes.
- Reglamento.

Disciplina, Notificaciones, Horarios globales y Canchas globales no deben aparecer como configuraciones globales editables duplicadas.

Las categorias creadas por el profesor deben quedar disponibles para registros, altas administrativas de jugadores, inscripciones y creacion de torneos siempre que esten Activas.

La validacion deportiva de categoria debe usar categoryId, rama y nivel jerarquico. El nombre visible no debe utilizarse como criterio de comparacion deportiva.

## RANKING Y AJUSTE DE PUNTOS

La posicion de ranking nunca se edita manualmente.

El profesor puede ajustar puntos sumando o restando, siempre con motivo obligatorio. Luego GAME recalcula automaticamente las posiciones segun puntos dentro de la categoria correspondiente y registra movimiento/auditoria.

Los jugadores con 0 puntos no aparecen en el Ranking Global activo.

## PERFIL, BLOQUEO, BENEFICIO Y REGLAMENTO

El jugador puede editar datos personales permitidos y foto en MOCK, pero no puede editar su categoria desde Perfil.

El descenso se gestiona por Solicitudes. Al aprobar una solicitud, GAME actualiza automaticamente categoryId y categoryName, registra categoria anterior, nueva categoria, fecha, motivo e historial.

El bloqueo manual o automatico por 3 faltas confirmadas cambia el estado del jugador a Bloqueado, impide nuevas inscripciones y conserva historial. El desbloqueo manual no borra faltas.

El detalle administrativo del jugador puede guardar un beneficio individual como porcentaje de descuento y duracion definida o indefinida. El porcentaje representa descuento sobre el valor de inscripcion.

El Reglamento debe tener CRUD desde Configuracion y el jugador debe poder consultar el reglamento vigente. Si no existe reglamento publicado, GAME muestra un estado vacio explicito.

Partidos no debe aparecer como modulo global visible en Admin ni Player. Los partidos se consultan y administran dentro de cada torneo y categoria, manteniendo rutas internas cuando sean necesarias para abrir detalles.